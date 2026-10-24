import { describe, expect, it } from "vitest";
import { extractSnapshot } from "./extract.ts";

const html = `
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "EducationEvent",
  "name": "Platforms keynote",
  "startDate": "2026-10-28T10:30:00-07:00",
  "endDate": "2026-10-28T11:15:00-07:00",
  "description": "How the platform is built.",
  "location": { "@type": "Place", "name": "Room 201" },
  "performer": {
    "@type": "Person",
    "name": "Priya Shah",
    "jobTitle": "Maintainer",
    "worksFor": { "@type": "Organization", "name": "Northstar" }
  }
}
</script>
`;

describe("extractSnapshot", () => {
  it("keeps the talk, the named speaker, and their company", () => {
    const snapshot = extractSnapshot(html, "https://example.com/agenda");
    expect(snapshot.nodes.map((node) => node.label).sort()).toEqual(["Company", "Person", "Talk"]);
    expect(snapshot.edges.map((edge) => edge.type).sort()).toEqual(["SPEAKS_AT", "WORKS_AT"]);
  });

  it("drops a session that has no start time", () => {
    const bare = `<script type="application/ld+json">{"@type":"Event","name":"Untitled"}</script>`;
    expect(extractSnapshot(bare, "https://example.com").nodes).toEqual([]);
  });
});
