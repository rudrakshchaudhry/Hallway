import { budget } from './budget.ts';

console.log(JSON.stringify(await budget.status(), null, 2));
