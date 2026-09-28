const swaggerDoc = {
  openapi: '3.0.0',
  info: {
    title: 'SupportDesk API',
    description: 'Helpdesk ticketing system backend with jwt auth, socket.io updates and fcm push.',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:5000' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string' },
          role: { type: 'string', enum: ['user', 'agent', 'admin'] },
        },
      },
      Ticket: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string', enum: ['open', 'in-progress', 'resolved', 'closed'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          createdBy: { $ref: '#/components/schemas/User' },
          assignedTo: { $ref: '#/components/schemas/User' },
          sla: { type: 'object' },
          dueDate: { type: 'string', format: 'date-time' },
          breached: { type: 'boolean' },
        },
      },
      Comment: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          ticket: { $ref: '#/components/schemas/Ticket' },
          user: { $ref: '#/components/schemas/User' },
          message: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      SLA: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          responseTimeHours: { type: 'number' },
          resolutionTimeHours: { type: 'number' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Rahul Sharma' },
                  email: { type: 'string', example: 'rahul@email.com' },
                  password: { type: 'string', example: 'pass123' },
                  role: { type: 'string', enum: ['user', 'agent', 'admin'] },
                  fcmToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get a jwt',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 401: { description: 'Invalid email or password' } },
      },
    },
    '/api/auth/firebase': {
      post: {
        tags: ['Auth'],
        summary: 'Login with a firebase id token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: {
                  idToken: { type: 'string' },
                  fcmToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 503: { description: 'Firebase not configured' } },
      },
    },
    '/api/tickets': {
      get: {
        tags: ['Tickets'],
        summary: 'List tickets visible to the logged in user',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Create a ticket',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title', 'description'],
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/tickets/{id}': {
      get: {
        tags: ['Tickets'],
        summary: 'Get one ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' }, 404: { description: 'Ticket not found' } },
      },
      put: {
        tags: ['Tickets'],
        summary: 'Update a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
      delete: {
        tags: ['Tickets'],
        summary: 'Delete a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/tickets/{id}/status': {
      put: {
        tags: ['Tickets'],
        summary: 'Change ticket status (agent or admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['open', 'in-progress', 'resolved', 'closed'] } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/tickets/{id}/assign': {
      put: {
        tags: ['Tickets'],
        summary: 'Assign a ticket to an agent (agent or admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['agentId'],
                properties: { agentId: { type: 'string' } },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/comments': {
      get: {
        tags: ['Comments'],
        summary: 'Comments written by the logged in user',
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Comments'],
        summary: 'Add a comment on a ticket',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ticketId', 'message'],
                properties: {
                  ticketId: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/comments/ticket/{id}': {
      get: {
        tags: ['Comments'],
        summary: 'All comments on a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/sla': {
      get: {
        tags: ['SLA'],
        summary: 'List sla rules',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/sla/{id}': {
      put: {
        tags: ['SLA'],
        summary: 'Update sla times (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  responseTimeHours: { type: 'number' },
                  resolutionTimeHours: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/admin/tickets': {
      get: {
        tags: ['Admin'],
        summary: 'All tickets (admin)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/admin/reports': {
      get: {
        tags: ['Admin'],
        summary: 'Ticket counts by status, priority, sla breaches and per agent',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/notifications/send': {
      post: {
        tags: ['Notifications'],
        summary: 'Send a fcm push to a user (admin or agent)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'title', 'body'],
                properties: {
                  userId: { type: 'string' },
                  title: { type: 'string' },
                  body: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' }, 503: { description: 'Firebase not configured' } },
      },
    },
  },
};

module.exports = swaggerDoc;
