import { describe, expect, it } from 'vitest';
import { companyId, isCompany, kindOf, linkedinSlug, skillsIn } from './map.ts';
import { pacific, plainText, slug, SnapshotBuilder, utcToPacific } from './util.ts';

describe('ingest mapping helpers', () => {
  it('maps catalog session types to Talk kinds', () => {
    expect(kindOf('Main Stage')).toBe('keynote');
    expect(kindOf('Keynote')).toBe('keynote');
    expect(kindOf('Workshop')).toBe('workshop');
    expect(kindOf('Panel Discussion')).toBe('panel');
    expect(kindOf('Product Demo')).toBe('talk');
    expect(kindOf(undefined)).toBe('talk');
  });

  it('derives stable ids without "|"', () => {
    expect(linkedinSlug('https://www.linkedin.com/in/Jenny-P%C3%A9rez/')).toBe('jenny-perez');
    expect(linkedinSlug('https://example.com/x')).toBeUndefined();
    expect(slug('AT&T | Labs')).toBe('at-and-t-labs');
    expect(companyId('Levi Strauss & Co.')).toBe('company:levi-strauss-and-co');
    expect(isCompany('Independent')).toBe(false);
  });

  it('formats Pacific times with offsets', () => {
    expect(pacific('2026-10-28', '13:30')).toBe('2026-10-28T13:30:00-07:00');
    expect(utcToPacific('2026-10-27T16:00:00.000Z')).toBe('2026-10-27T09:00:00-07:00');
  });

  it('strips HTML to plain text', () => {
    expect(plainText('<p>Fish &amp; chips</p><p>Line&nbsp;two &#39;ok&#39;</p>')).toBe("Fish & chips\nLine two 'ok'");
  });

  it('finds skills in job text', () => {
    expect(skillsIn('Senior Software Engineer, Go and Kubernetes (AI platform)')).toEqual(
      expect.arrayContaining(['Go', 'Kubernetes', 'AI/ML']),
    );
    expect(skillsIn('Account Executive')).toEqual([]);
  });

  it('skips invalid nodes and dangling edges', async () => {
    const b = new SnapshotBuilder('test');
    expect(b.node({ label: 'Topic', id: 'topic:ai', name: 'AI', extra: null })).toBe('topic:ai');
    expect(b.node({ label: 'Topic', id: 'bad|id', name: 'x' })).toBeUndefined();
    b.edge('SIMILAR_TO', 'talk:a', 'pasttalk:b'); // missing required score
    expect(b.edges.size).toBe(0);
    expect(b.nodes.get('topic:ai')).toEqual({ label: 'Topic', id: 'topic:ai', name: 'AI' });
  });
});
