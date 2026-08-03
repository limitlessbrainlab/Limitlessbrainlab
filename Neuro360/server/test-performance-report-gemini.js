const assert = require('assert/strict');

process.env.NEXAPROC_MASTER_KEY = '';

const calls = [];
const geminiPath = require.resolve('./services/geminiService');
require.cache[geminiPath] = {
  exports: {
    async generateText(prompt) {
      calls.push(prompt);
      if (prompt.includes('TRANSCRIBE the numbers EXACTLY')) {
        return `\`\`\`json
{
  "patient": { "name": "Test Patient", "assessmentDate": "2026-08-03" },
  "overall": { "score": "14", "percentage": "67" },
  "markers": { "stressRegulation": 100, "cognition": 67 },
  "deepDive": { "alphaPeak": 11.6, "frontalAsymmetry": -9.97 }
}
\`\`\``;
      }
      return '{"snapshotSummary":"Stable Gemini narrative","closing":"Keep progressing."}';
    },
  },
};

const { extractReportSource, generateReportNarrative } = require('./services/nexaprocService');

(async () => {
  const source = await extractReportSource('Overall Brain Health Score: 14/21 (67%)');
  assert.deepEqual(source, {
    patient: { name: 'Test Patient', assessmentDate: '2026-08-03' },
    overall: { score: '14', percentage: '67' },
    markers: { stressRegulation: 100, cognition: 67 },
    deepDive: { alphaPeak: 11.6, frontalAsymmetry: -9.97 },
  });

  const narrative = await generateReportNarrative({
    patient: { name: 'Test Patient', assessmentDate: '2026-08-03' },
    brainType: { name: 'Cautious' },
  });
  assert.deepEqual(narrative, {
    snapshotSummary: 'Stable Gemini narrative',
    closing: 'Keep progressing.',
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /14\/21 \(67%\)/);
  assert.match(calls[1], /Test Patient/);

  console.log('performance report Gemini provider self-check ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
