import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// MCP Server Manager
class MCPServerManager {
  constructor() {
    this.servers = new Map();
  }

  async startServer(name, scriptPath) {
    const serverProcess = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const server = {
      process: serverProcess,
      ready: false,
      tools: [],
    };

    this.servers.set(name, server);

    // Get tools from server
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    serverProcess.stdin.write(JSON.stringify(toolsRequest) + '\n');

    return new Promise((resolve, reject) => {
      serverProcess.stdout.once('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          server.tools = response.result.tools;
          server.ready = true;
          console.log(`✓ ${name} MCP server started with ${server.tools.length} tools`);
          resolve(server);
        } catch (error) {
          reject(error);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.log(`${name}:`, data.toString());
      });

      setTimeout(() => reject(new Error(`${name} server timeout`)), 5000);
    });
  }

  async callTool(serverName, toolName, args) {
    const server = this.servers.get(serverName);
    if (!server || !server.ready) {
      throw new Error(`Server ${serverName} not ready`);
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 10000);

      const handleData = (data) => {
        try {
          const lines = data.toString().split('\n').filter(line => line.trim());
          for (const line of lines) {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              server.process.stdout.removeListener('data', handleData);
              resolve(response.result);
            }
          }
        } catch (error) {
          clearTimeout(timeout);
          server.process.stdout.removeListener('data', handleData);
          reject(error);
        }
      };

      server.process.stdout.on('data', handleData);
      server.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  getAllTools() {
    const allTools = [];
    for (const [serverName, server] of this.servers) {
      if (server.ready) {
        allTools.push(...server.tools.map(tool => ({
          ...tool,
          serverName,
        })));
      }
    }
    return allTools;
  }
}

const mcpManager = new MCPServerManager();

// Initialize MCP servers
async function initializeMCPServers() {
  try {
    await mcpManager.startServer('database', join(__dirname, 'mcp-servers', 'database-server.js'));
    await mcpManager.startServer('email', join(__dirname, 'mcp-servers', 'email-server.js'));
    console.log('✓ All MCP servers initialized');
  } catch (error) {
    console.error('Failed to initialize MCP servers:', error);
    process.exit(1);
  }
}

// API Endpoint: Chat with Claude Agent
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Build messages array
    const messages = [
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    // Get available tools
    const tools = mcpManager.getAllTools().map(tool => ({
      name: `${tool.serverName}_${tool.name}`,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    const toolActivity = [];
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a helpful customer support agent. You have access to customer database and email systems through MCP tools.

When helping customers:
1. Search for their information using search_customer
2. Get order details if they ask about orders
3. Send confirmation emails when appropriate
4. Be friendly and professional

Available tools:
- database_search_customer: Search for customer by email
- database_get_order_details: Get order information
- email_send_email: Send emails to customers`,
      messages,
      tools,
    });

    // Handle tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlock = response.content.find(block => block.type === 'tool_use');
      
      if (toolUseBlock) {
        const [serverName, toolName] = toolUseBlock.name.split('_', 2);
        const actualToolName = toolUseBlock.name.substring(serverName.length + 1);
        
        toolActivity.push({
          server: serverName,
          tool: actualToolName,
          input: toolUseBlock.input,
          timestamp: new Date().toISOString(),
        });

        console.log(`Calling ${serverName}:${actualToolName}`, toolUseBlock.input);

        // Call MCP tool
        const toolResult = await mcpManager.callTool(serverName, actualToolName, toolUseBlock.input);
        
        const toolResultContent = toolResult.content[0].text;
        toolActivity[toolActivity.length - 1].result = JSON.parse(toolResultContent);

        // Continue conversation with tool result
        messages.push({
          role: 'assistant',
          content: response.content,
        });
        
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: toolResultContent,
            },
          ],
        });

        response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: `You are a helpful customer support agent. You have access to customer database and email systems through MCP tools.

When helping customers:
1. Search for their information using search_customer
2. Get order details if they ask about orders
3. Send confirmation emails when appropriate
4. Be friendly and professional`,
          messages,
          tools,
        });
      }
    }

    // Extract text response
    const textBlock = response.content.find(block => block.type === 'text');
    const assistantMessage = textBlock ? textBlock.text : 'I apologize, but I encountered an issue processing your request.';

    res.json({
      message: assistantMessage,
      toolActivity,
      conversationHistory: [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: assistantMessage },
      ],
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const serverStatus = {};
  for (const [name, server] of mcpManager.servers) {
    serverStatus[name] = {
      ready: server.ready,
      tools: server.tools.length,
    };
  }
  
  res.json({
    status: 'ok',
    servers: serverStatus,
  });
});

// Start server
async function start() {
  await initializeMCPServers();
  
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/chat`);
    console.log(`💚 Health check: http://localhost:${PORT}/api/health\n`);
  });
}

start().catch(console.error);