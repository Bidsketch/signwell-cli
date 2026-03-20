import type { Argv } from 'yargs';
import { z } from 'zod';
import { printInfo, setOutputMode } from '../lib/output.js';

// Zod schemas for all command inputs
const FileInput = z.object({
  name: z.string(),
  file_base64: z.string().optional(),
  file_url: z.string().url().optional(),
});

const RecipientInput = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  embedded_signing: z.boolean().optional(),
});

const FieldInput = z.object({
  name: z.string(),
  value: z.string(),
});

const schemas: Record<string, { description: string; input: z.ZodType; output: z.ZodType }> = {
  'documents.create': {
    description: 'Create a new document for signing',
    input: z.object({
      name: z.string().optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
      draft: z.boolean().optional(),
      text_tags: z.boolean().optional(),
      redirect_url: z.string().url().optional(),
      signing_order: z.boolean().optional(),
      expires_in: z.number().optional(),
      reminders: z.array(z.number()).optional(),
      files: z.array(FileInput).min(1),
      recipients: z.array(RecipientInput).min(1),
      test_mode: z.boolean().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        recipients: z.array(z.object({
          id: z.string(),
          email: z.string(),
          name: z.string().optional(),
          status: z.string(),
          signing_url: z.string().optional(),
          embedded_signing_url: z.string().optional(),
        })),
      }),
      meta: z.object({}).passthrough(),
    }),
  },
  'documents.get': {
    description: 'Get document details by ID',
    input: z.object({ id: z.string() }),
    output: z.object({
      success: z.boolean(),
      data: z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        created_at: z.string(),
        recipients: z.array(z.object({
          email: z.string(),
          name: z.string().optional(),
          status: z.string(),
        })),
      }),
      meta: z.object({}).passthrough(),
    }),
  },
  'documents.list': {
    description: 'List documents with pagination',
    input: z.object({
      page: z.number().optional(),
      per_page: z.number().optional(),
      status: z.enum(['pending', 'completed', 'cancelled', 'draft']).optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.array(z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        created_at: z.string(),
      })),
      meta: z.object({
        count: z.number(),
        total: z.number(),
        page: z.number(),
        per_page: z.number(),
        total_pages: z.number(),
      }),
    }),
  },
  'documents.send': {
    description: 'Send a draft document',
    input: z.object({ id: z.string() }),
    output: z.object({ success: z.boolean(), data: z.object({ id: z.string(), status: z.string() }), meta: z.object({}).passthrough() }),
  },
  'documents.delete': {
    description: 'Delete a document',
    input: z.object({ id: z.string(), confirm: z.boolean().optional() }),
    output: z.object({ success: z.boolean(), data: z.object({ id: z.string(), deleted: z.boolean() }), meta: z.object({}).passthrough() }),
  },
  'templates.create': {
    description: 'Create a new template',
    input: z.object({
      name: z.string(),
      files: z.array(FileInput).min(1),
      placeholder_roles: z.array(z.object({ name: z.string(), email: z.string().optional() })).optional(),
      text_tags: z.boolean().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.object({ id: z.string(), name: z.string() }),
      meta: z.object({}).passthrough(),
    }),
  },
  'templates.list': {
    description: 'List templates with pagination',
    input: z.object({
      page: z.number().optional(),
      per_page: z.number().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.array(z.object({ id: z.string(), name: z.string(), created_at: z.string() })),
      meta: z.object({ count: z.number(), total: z.number(), page: z.number() }),
    }),
  },
  'templates.use': {
    description: 'Create a document from a template',
    input: z.object({
      template_ids: z.array(z.string()).min(1),
      recipients: z.array(z.object({
        placeholder_name: z.string().optional(),
        email: z.string().email(),
        name: z.string().optional(),
      })).min(1),
      fields: z.array(FieldInput).optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
      draft: z.boolean().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.object({ id: z.string(), name: z.string(), status: z.string() }),
      meta: z.object({}).passthrough(),
    }),
  },
  'bulk-send.create': {
    description: 'Create a bulk send from CSV',
    input: z.object({
      template_ids: z.array(z.string()).min(1),
      csv: z.string().describe('CSV content or path'),
      name: z.string().optional(),
      test_mode: z.boolean().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.object({ id: z.string(), status: z.string(), total: z.number() }),
      meta: z.object({}).passthrough(),
    }),
  },
  'webhooks.create': {
    description: 'Create a webhook endpoint',
    input: z.object({
      url: z.string().url(),
      event_types: z.array(z.string()).optional(),
    }),
    output: z.object({
      success: z.boolean(),
      data: z.object({ id: z.string(), url: z.string(), secret: z.string().optional() }),
      meta: z.object({}).passthrough(),
    }),
  },
};

function zodToJsonSchema(schema: z.ZodType): unknown {
  // Basic Zod to JSON Schema converter
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value as z.ZodType);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }

  return {};
}

export function registerSchemaCommand(yargs: Argv): Argv {
  return yargs.command(
    'schema <command>',
    'Print JSON Schema for a command',
    (y) =>
      y.positional('command', {
        type: 'string',
        demandOption: true,
        describe: 'Command name (e.g., documents.create, templates.use)',
      }),
    (argv) => {
      const commandName = argv.command as string;
      const schema = schemas[commandName];

      if (!schema) {
        const available = Object.keys(schemas).join(', ');
        console.error(`Unknown command: ${commandName}`);
        console.error(`Available: ${available}`);
        process.exit(2);
      }

      const output = {
        command: commandName,
        description: schema.description,
        input_schema: zodToJsonSchema(schema.input),
        output_schema: zodToJsonSchema(schema.output),
      };

      printInfo(JSON.stringify(output, null, 2));
    },
  );
}

export { schemas };
