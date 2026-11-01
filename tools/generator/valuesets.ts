/**
 * Largest code list that becomes a union type; longer ones stay `string`.
 * Measured: the longest finite required-binding lists in R4 to R5 have 203,
 * 211, 213, 231 and 346 codes, and R4's own schema inlines the 346-code one
 * (ImplementationGuide.license), so a lower cap would make R4 stricter than
 * R4B and R5 for the same field.
 */
export const MAX_UNION_SIZE = 400;

interface Concept {
  code: string;
  concept?: Concept[];
  property?: { code: string; valueBoolean?: boolean }[];
}

interface Include {
  system?: string;
  concept?: { code: string }[];
  filter?: unknown[];
  valueSet?: string[];
}

interface ValueSet {
  resourceType: 'ValueSet';
  url?: string;
  compose?: { include?: Include[]; exclude?: Include[] };
}

interface CodeSystem {
  resourceType: 'CodeSystem';
  url?: string;
  content?: string;
  concept?: Concept[];
}

export type Resolution = { codes: string[] } | { reason: string };

const withoutVersion = (url: string): string => url.split('|')[0];

/** A grouping code such as Questionnaire item type `question`: not a usable value. */
const isNotSelectable = (concept: Concept): boolean =>
  (concept.property ?? []).some(
    (property) =>
      property.code === 'notSelectable' && property.valueBoolean === true,
  );

/**
 * Concept codes depth first, so a hierarchy flattens in the order it is
 * written. Not-selectable concepts are left out but their children are kept.
 */
const flatten = (concepts: Concept[]): string[] =>
  concepts.flatMap((concept: Concept) => [
    ...(isNotSelectable(concept) ? [] : [concept.code]),
    ...flatten(concept.concept ?? []),
  ]);

const unique = (codes: string[]): string[] => [...new Set(codes)];

/**
 * Builds a function from a value set URL to its code list. Only what can be
 * listed with certainty is listed: explicit concepts, whole code systems that
 * are complete in the same file, and other resolvable value sets (union,
 * intersection and exclusion as FHIR defines them). Filters, external code
 * systems and lists beyond MAX_UNION_SIZE give a reason instead.
 */
export const createValueSetResolver = (
  resources: unknown[],
  maxSize: number = MAX_UNION_SIZE,
): ((url: string) => Resolution) => {
  const valueSets = new Map<string, ValueSet>();
  const codeSystems = new Map<string, CodeSystem>();

  (resources as { resourceType: string; url?: string }[]).forEach(
    (resource) => {
      if (!resource.url) return;
      if (resource.resourceType === 'ValueSet') {
        valueSets.set(resource.url, resource as ValueSet);
      } else if (resource.resourceType === 'CodeSystem') {
        codeSystems.set(resource.url, resource as CodeSystem);
      }
    },
  );

  const systemCodes = (include: Include): Resolution => {
    if (include.filter && include.filter.length > 0) {
      return { reason: 'filter' };
    }

    if (include.concept) {
      return { codes: include.concept.map((concept) => concept.code) };
    }

    const system = codeSystems.get(withoutVersion(include.system as string));

    if (!system)
      return { reason: `code system not in file: ${include.system}` };
    if (system.content !== 'complete') {
      return { reason: `code system is ${system.content}: ${include.system}` };
    }

    return { codes: flatten(system.concept ?? []) };
  };

  const resolveInclude = (include: Include, seen: string[]): Resolution => {
    const parts: Resolution[] = [];

    if (include.system) parts.push(systemCodes(include));
    (include.valueSet ?? []).forEach((url: string) =>
      parts.push(resolveUrl(url, seen)),
    );

    const failed = parts.find(
      (part): part is { reason: string } => 'reason' in part,
    );

    if (failed) return failed;
    if (parts.length === 0) return { reason: 'empty include' };

    // Several constraints in one include (a system and/or value sets) intersect.
    const lists = parts.map((part) => (part as { codes: string[] }).codes);

    return {
      codes: lists[0].filter((code: string) =>
        lists.every((list: string[]) => list.includes(code)),
      ),
    };
  };

  const resolveAll = (includes: Include[], seen: string[]): Resolution => {
    const results = includes.map((include: Include) =>
      resolveInclude(include, seen),
    );
    const failed = results.find(
      (result): result is { reason: string } => 'reason' in result,
    );

    return (
      failed ?? {
        codes: unique(
          results.flatMap((result) => (result as { codes: string[] }).codes),
        ),
      }
    );
  };

  function resolveUrl(url: string, seen: string[]): Resolution {
    const key = withoutVersion(url);
    const valueSet = valueSets.get(key);

    if (!valueSet) return { reason: `value set not in file: ${key}` };
    if (seen.includes(key))
      return { reason: `value set includes itself: ${key}` };
    if (!valueSet.compose?.include?.length)
      return { reason: 'no compose.include' };

    const included = resolveAll(valueSet.compose.include, [...seen, key]);

    if ('reason' in included) return included;

    const excluded = resolveAll(valueSet.compose.exclude ?? [], [...seen, key]);

    if ('reason' in excluded) return excluded;

    const codes = included.codes.filter(
      (code: string) => !excluded.codes.includes(code),
    );

    return codes.length === 0 ? { reason: 'no codes' } : { codes };
  }

  return (url: string): Resolution => {
    const resolution = resolveUrl(url, []);

    return 'codes' in resolution && resolution.codes.length > maxSize
      ? { reason: `${resolution.codes.length} codes, more than ${maxSize}` }
      : resolution;
  };
};
