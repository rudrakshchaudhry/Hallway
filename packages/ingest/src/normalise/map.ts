import { slug } from './util.ts';

const NOT_A_COMPANY = new Set(['independent', 'self-employed', 'freelance', 'n/a', 'none']);

export const companyId = (name: string) => `company:${slug(name)}`;
export const isCompany = (name: string | undefined): name is string =>
  !!name && !NOT_A_COMPANY.has(name.toLowerCase().trim());

export function kindOf(type: string | undefined): 'keynote' | 'workshop' | 'panel' | 'talk' {
  const t = (type ?? '').toLowerCase();
  if (t === 'main stage' || t === 'keynote') return 'keynote';
  if (t === 'workshop') return 'workshop';
  if (t.startsWith('panel')) return 'panel';
  return 'talk';
}

/** "https://www.linkedin.com/in/Jenny-P%C3%A9rez/" → "jenny-perez". */
export function linkedinSlug(url: string | undefined): string | undefined {
  const m = url?.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!m?.[1]) return undefined;
  let key: string;
  try {
    key = decodeURIComponent(m[1]);
  } catch {
    key = m[1];
  }
  return slug(key);
}


// Skills recognised in job titles/summaries (word-boundary regex → display name).
const SKILLS: [RegExp, string][] = [
  [/\btypescript\b/i, 'TypeScript'],
  [/\bjavascript\b|\bnode\.?js\b/i, 'JavaScript'],
  [/\bpython\b/i, 'Python'],
  [/\bgolang\b|\bGo\b(?=[\s,/)])/, 'Go'], // capitalised: skip the verb
  [/\brust\b/i, 'Rust'],
  [/\bjava\b(?!script)/i, 'Java'],
  [/\bc\+\+/i, 'C++'],
  [/\bkubernetes\b|\bk8s\b/i, 'Kubernetes'],
  [/\bsecurity\b|\bappsec\b/i, 'Security'],
  [/\bmachine learning\b|\bai\b|\bml\b|\bllm/i, 'AI/ML'],
  [/\breact\b/i, 'React'],
  [/\bfront[- ]?end\b/i, 'Frontend'],
  [/\bback[- ]?end\b/i, 'Backend'],
  [/\bdevops\b|\bsre\b|site reliability/i, 'DevOps'],
  [/\bcloud\b|\baws\b|\bazure\b|\bgcp\b/i, 'Cloud'],
  [/\bdata engineer|\bdata platform|\bspark\b/i, 'Data'],
  [/\bdistributed systems\b/i, 'Distributed systems'],
  [/\bobservability\b/i, 'Observability'],
];
export function skillsIn(text: string): string[] {
  return [...new Set(SKILLS.filter(([re]) => re.test(text)).map(([, name]) => name))];
}

