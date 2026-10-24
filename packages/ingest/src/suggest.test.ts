import { describe, expect, it } from "vitest";
import { suggestEvents } from "./suggest.ts";
import { UnlockError } from "./unlock.ts";

const page = `
<script type="application/ld+json">
{
  "@type": "Event",
  "name": "Platforms keynote",
  "startDate": "2026-10-28T10:30:00Z",
  "description": "A session about platforms and shipping."
}
</script>`;

const cache = {
  snapshot: {
    nodes: [{
      label: "Talk" as const,
      id: "talk:saved-1",
      title: "Saved platforms talk",
      abstract: "platforms",
      start: "2026-10-28T10:30:00Z",
    }],
    edges: [],
  },
  fresh: false,
};

describe("suggestEvents", () => {
  it("asks for words before it scrapes", async () => {
    const result = await suggestEvents({ url: "https://example.com", intent: "  ", cache: { snapshot: null, fresh: false } });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/what you want/i);
  });

  it("rejects a link that is not a web address", async () => {
    const result = await suggestEvents({ url: "not a url", intent: "platforms", cache: { snapshot: null, fresh: false } });
    expect(result.message).toMatch(/https/i);
  });

  it("returns the session that matches the user's words", async () => {
    const result = await suggestEvents({
      url: "https://example.com/agenda",
      intent: "I want platforms",
      fetchPage: async () => page,
      cache: { snapshot: null, fresh: false },
      persist: false,
    });
    expect(result.ok).toBe(true);
    expect(result.suggestions.map((item) => item.title)).toEqual(["Platforms keynote"]);
  });

  it("says when the page has sessions but none match", async () => {
    const result = await suggestEvents({
      url: "https://example.com/agenda",
      intent: "fundraising",
      fetchPage: async () => page,
      cache: { snapshot: null, fresh: false },
      persist: false,
    });
    expect(result.ok).toBe(true);
    expect(result.suggestions).toEqual([]);
    expect(result.message).toMatch(/nothing on that page/i);
  });

  it("says when the page has no sessions", async () => {
    const result = await suggestEvents({
      url: "https://example.com",
      intent: "platforms",
      fetchPage: async () => "<html>hello</html>",
      cache: { snapshot: null, fresh: false },
      persist: false,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no published sessions/i);
  });

  it("shows the saved copy when the live fetch times out", async () => {
    const result = await suggestEvents({
      url: "https://example.com",
      intent: "platforms",
      fetchPage: async () => {
        throw new UnlockError("timeout", "slow");
      },
      cache,
      persist: false,
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe("cache");
    expect(result.suggestions[0]?.title).toBe("Saved platforms talk");
    expect(result.message).toMatch(/too long/i);
  });
});
