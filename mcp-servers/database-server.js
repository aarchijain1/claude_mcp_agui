import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Mock database
const customers = {
  'john.doe@example.com': {
    id: 'CUST-12345',
    name: 'John Doe',
    email: 'john.doe@example.com',
    tier: 'Premium',
    joinDate: '2023-06-15',
    orders: [
      { id: 'ORD-001', status: 'Delivered', date: '2024-11-20' },
      { id: 'ORD-002', status: 'Pending', date: '2024-11-28' }
    ]
  },
  'jane.smith@example.com': {
    id: 'CUST-67890',
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    tier: 'Basic',
    joinDate: '2024-01-10',
    orders: [
      { id: 'ORD-003', status: 'Shipped', date: '2024-11-29' }
    ]
  }
};

const orders = {
  'ORD-001': {
    id: 'ORD-001',
    items: ['Laptop Stand', 'Wireless Mouse'],
    total: '$79.99',
    status: 'Delivered',
    trackingNumber: 'TRK-1111111111',
    estimatedDelivery: '2024-11-22'
  },
  'ORD-002': {
    id: 'ORD-002',
    items: ['Wireless Headphones', 'USB-C Cable'],
    total: '$89.99',
    status: 'Pending',
    trackingNumber: 'TRK-9876543210',
    estimatedDelivery: '2024-12-05'
  },
  'ORD-003': {
    id: 'ORD-003',
    items: ['Mechanical Keyboard'],
    total: '$129.99',
    status: 'Shipped',
    trackingNumber: 'TRK-5555555555',
    estimatedDelivery: '2024-12-03'
  }
};

const server = new Server(
  {
    name: 'database-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_customer',
        description: 'Search for a customer by email address',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'Customer email address',
            },
          },
          required: ['email'],
        },
      },
      {
        name: 'get_order_details',
        description: 'Get detailed information about a specific order',
        inputSchema: {
          type: 'object',
          properties: {
            orderId: {
              type: 'string',
              description: 'Order ID',
            },
          },
          required: ['orderId'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'search_customer': {
      const customer = customers[args.email];
      if (!customer) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Customer not found' }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(customer),
          },
        ],
      };
    }

    case 'get_order_details': {
      const order = orders[args.orderId];
      if (!order) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Order not found' }),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(order),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Database MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});