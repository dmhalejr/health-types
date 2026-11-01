import { collectRefs } from './refs';
import { DefinitionModel, PropertyModel, TypeModel } from './types';

const INDENT = '  ';

/** A union whose one-line form is longer than this is written one member per line. */
export const DEFAULT_LINE_WIDTH = 80;

export interface EmitOptions {
  /** Pass `Infinity` to keep every union on one line. */
  lineWidth?: number;
}

const quote = (value: string): string =>
  `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** JSDoc block for a description; `*\/` inside it must not end the comment. */
const renderDoc = (
  description: string | undefined,
  indent: string,
): string[] => {
  if (!description) {
    return [];
  }

  const text = description.replace(/\*\//g, '*\\/').trim();

  if (!text.includes('\n')) {
    return [`${indent}/** ${text} */`];
  }

  return [
    `${indent}/**`,
    ...text.split('\n').map((line: string) => `${indent} * ${line}`.trimEnd()),
    `${indent} */`,
  ];
};

const renderType = (type: TypeModel, indent: string, width: number): string => {
  switch (type.kind) {
    case 'primitive':
      return type.name;
    case 'ref':
      return type.name;
    case 'literal':
      return type.values.map(quote).join(' | ');
    case 'array': {
      const item = renderType(type.item, indent, width);

      if (type.nullableItems) {
        return `(${item} | null)[]`;
      }

      return type.item.kind === 'literal' && type.item.values.length > 1
        ? `(${item})[]`
        : `${item}[]`;
    }
    case 'object':
      return type.properties.length === 0
        ? 'Record<string, unknown>'
        : `{\n${renderProperties(
            type.properties,
            indent + INDENT,
            width,
          )}\n${indent}}`;
  }
};

/** The union of a property typed as a union or as an array of one, if it has several members. */
const unionOf = (type: TypeModel): string[] | undefined => {
  const literal =
    type.kind === 'literal'
      ? type
      : type.kind === 'array' && type.item.kind === 'literal'
      ? type.item
      : undefined;

  return literal && literal.values.length > 1 ? literal.values : undefined;
};

/** Prettier layout: one `| 'member'` per line, an array of the union in parentheses. */
const renderWrappedUnion = (
  head: string,
  values: string[],
  isArray: boolean,
  indent: string,
): string[] => {
  const members = values.map(
    (value: string) => `${indent}${INDENT}| ${quote(value)}`,
  );

  return isArray
    ? [`${head} (`, ...members, `${indent})[];`]
    : [
        head,
        ...members.map((member: string, index: number) =>
          index === members.length - 1 ? `${member};` : member,
        ),
      ];
};

const renderProperty = (
  property: PropertyModel,
  indent: string,
  width: number,
): string => {
  const head = `${indent}${property.name}${property.required ? '' : '?'}:`;
  const single = `${head} ${renderType(property.type, indent, width)};`;
  const values = unionOf(property.type);

  return [
    ...renderDoc(property.description, indent),
    ...(values && single.length > width
      ? renderWrappedUnion(head, values, property.type.kind === 'array', indent)
      : [single]),
  ].join('\n');
};

const renderProperties = (
  properties: PropertyModel[],
  indent: string,
  width: number,
): string =>
  properties
    .map((property: PropertyModel) => renderProperty(property, indent, width))
    .join('\n\n');

/**
 * Type-only imports keep mutually recursive types (Reference <-> Identifier)
 * from creating a runtime cycle.
 */
const renderImports = (names: string[]): string[] =>
  names.length === 0
    ? []
    : [
        ...names.map(
          (name: string) => `import type { ${name} } from './${name}';`,
        ),
        '',
      ];

const renderBody = (model: DefinitionModel, width: number): string[] =>
  !model.unionOf && model.properties.length === 0
    ? // An empty interface would accept any non-null value; this is "no keys".
      [`export type ${model.name} = Record<string, never>;`]
    : model.unionOf && model.unionOf.length === 0
    ? [`export type ${model.name} = never;`]
    : model.unionOf
    ? [
        `export type ${model.name} =`,
        ...model.unionOf.map(
          (member: string, index: number, members: string[]) =>
            `${INDENT}| ${member}${index === members.length - 1 ? ';' : ''}`,
        ),
      ]
    : [
        `export interface ${model.name} {`,
        renderProperties(model.properties, INDENT, width),
        '}',
      ];

/** Renders the TypeScript source for one definition. Pure; no I/O. */
export const emitDefinition = (
  model: DefinitionModel,
  { lineWidth = DEFAULT_LINE_WIDTH }: EmitOptions = {},
): string =>
  [
    ...renderImports(collectRefs(model)),
    ...renderDoc(model.description, ''),
    ...renderBody(model, lineWidth),
    '',
  ].join('\n');
