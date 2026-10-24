import type { Graph } from "falkordb";

/** Whether a Person with this id or handle exists, and whether it is an onboarded user. */
export async function findPerson(graph: Graph, id: string, handle?: string): Promise<{ id: string; isUser: boolean } | null> {
  const res = await graph.roQuery<{ id: string; isUser: boolean | null }>(
    "MATCH (p:Person) WHERE p.id = $id OR p.handle = $handle RETURN p.id AS id, p.isUser AS isUser LIMIT 1",
    { params: { id, handle: handle ?? "" } },
  );
  const row = res.data?.[0];
  return row ? { id: row.id, isUser: row.isUser === true } : null;
}

export async function listTopics(graph: Graph): Promise<{ id: string; name: string }[]> {
  const res = await graph.roQuery<{ id: string; name: string }>("MATCH (t:Topic) RETURN t.id AS id, t.name AS name ORDER BY name");
  return res.data ?? [];
}

/** A person's skills, topics and repos, for the demo profile card. */
export async function getProfileSummary(graph: Graph, id: string) {
  const res = await graph.roQuery<{ name: string | null; headline: string | null; skills: string[]; topics: string[]; repos: string[] }>(
    `MATCH (u:Person {id: $id})
     OPTIONAL MATCH (u)-[:SKILLED_IN]->(s:Skill)
     OPTIONAL MATCH (u)-[:INTERESTED_IN]->(t:Topic)
     OPTIONAL MATCH (u)-[:OWNS]->(r:Repo)
     RETURN u.name AS name, u.headline AS headline, collect(DISTINCT s.name) AS skills,
            collect(DISTINCT t.name) AS topics, collect(DISTINCT r.fullName) AS repos`,
    { params: { id } },
  );
  return res.data?.[0] ?? null;
}
