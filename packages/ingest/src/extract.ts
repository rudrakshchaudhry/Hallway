import { validateSnapshot, type GraphSnapshot } from "@hallway/types";

type Ld = Record<string, unknown>;

/**
 * Turns an official conference page into a graph snapshot.
 * Only schema.org Event data published on the page is kept.
 * A missing time or speaker stays out. Nothing is guessed.
 * People stored here are the ones the page names as performers.
 */
export function extractSnapshot(html: string, pageUrl: string): GraphSnapshot {
  const events = jsonLd(html).flatMap(collectEvents);
  const nodes = new Map<string, GraphSnapshot["nodes"][number]>();
  const edges: GraphSnapshot["edges"] = [];
  const slug = slugify(new URL(pageUrl).hostname.replace(/^www\./, ""));

  events.forEach((event, index) => {
    const title = text(event.name);
    const start = toIso(event.startDate);
    if (!title || !start) return;
    const talkId = `talk:${slug}-${index}-${slugify(title)}`;
    const room = text(record(event.location)?.name) ?? text(event.location);
    nodes.set(talkId, {
      label: "Talk",
      id: talkId,
      title,
      abstract: text(event.description) ?? "",
      kind: "talk",
      start,
      // v2 contract: end is required; a missing end gets start + 45 min (PLAN.md 6.1).
      end: toIso(event.endDate) ?? new Date(Date.parse(start) + 45 * 60_000).toISOString(),
      ...(room ? { room } : {}),
    });

    for (const person of performers(event)) {
      const name = text(person.name);
      if (!name) continue;
      const handle = slugify(name);
      const personId = `person:${handle}`;
      nodes.set(personId, {
        label: "Person",
        id: personId,
        handle,
        name,
        ...(text(person.jobTitle) ? { role: text(person.jobTitle) } : {}),
        optedIn: false,
        isUser: false,
      });
      edges.push({ type: "SPEAKS_AT", from: personId, to: talkId });
      const employer = text(record(person.worksFor)?.name) ?? text(record(person.affiliation)?.name);
      if (employer) {
        const companyId = `company:${slugify(employer)}`;
        nodes.set(companyId, { label: "Company", id: companyId, name: employer });
        edges.push({ type: "WORKS_AT", from: personId, to: companyId });
      }
    }
  });

  return validateSnapshot({ nodes: [...nodes.values()], edges });
}

function jsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const pattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // A broken block is skipped. The rest of the page can still be used.
    }
  }
  return blocks;
}

function collectEvents(value: unknown): Ld[] {
  const found: Ld[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) return;
    if (isEvent(node)) found.push(node);
    if (node["@graph"]) visit(node["@graph"]);
    if (node.subEvent) visit(node.subEvent);
  };
  visit(value);
  return found;
}

function isEvent(node: Ld): boolean {
  return types(node).some((type) => type === "Event" || type.endsWith("Event"));
}

function performers(event: Ld): Ld[] {
  return [...asArray(event.performer), ...asArray(event.actor)].filter(isRecord).filter((person) => {
    const type = types(person);
    if (type.some((item) => item.includes("Organization"))) return false;
    return typeof person.name === "string";
  });
}

function types(node: Ld): string[] {
  const value = node["@type"];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function isRecord(value: unknown): value is Ld {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Ld | undefined {
  return isRecord(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toIso(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00:00Z`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export function slugify(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "event";
}
