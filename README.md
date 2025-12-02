# Customer Support App - AGUI + MCP + Claude SDK

A full-stack customer support application demonstrating the integration of:
- **AGUI** (Agentic GUI) - React-based user interface
- **MCP** (Model Context Protocol) - Tool servers for database and email
- **Claude SDK** - AI agent orchestration

## Prerequisites

- Node.js v18 or higher
- Anthropic API key

## Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd customer-support-app
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
ANTHROPIC_API_KEY=your_api_key_here
PORT=3000
```

4. Start the server:
```bash
npm start
```

5. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure
```
customer-support-app/
├── mcp-servers/          # MCP tool servers
│   ├── database-server.js
│   └── email-server.js
├── public/               # Frontend
│   └── index.html
├── server.js             # Backend API
├── package.json
└── .env                  # Environment variables (not in git)
```

## Usage

Try these example queries:
- "What's the status of my order for john.doe@example.com?"
- "Check orders for jane.smith@example.com"
- "Send me tracking info for order ORD-002"

## Features

- Real-time chat interface with Claude AI
- MCP tool integration (database queries, email sending)
- Visual tool activity monitoring
- Multi-step agent workflows

## License

MIT
