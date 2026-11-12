async function fetchTrustedJotformSubmission(input, apiKey, request = fetch) {
  const fail = (message,status) => { throw Object.assign(new Error(message),{status}); };
  if (!apiKey) fail('JotForm verification is not configured',503);
  const formID=String(input?.formID || '').trim();
  const submissionID=String(input?.submissionID || '').trim();
  if (!/^\d+$/.test(formID) || !/^\d+$/.test(submissionID)) fail('Valid form and submission IDs are required',400);
  const response=await request(`https://api.jotform.com/submission/${submissionID}?apiKey=${encodeURIComponent(apiKey)}`,{signal:AbortSignal.timeout(15000)});
  if (!response.ok) fail('JotForm submission verification failed',502);
  const data=await response.json();const submission=data?.content;
  if (data.responseCode!==200 || String(submission?.id)!==submissionID || String(submission?.form_id)!==formID || submission.status!=='ACTIVE') fail('JotForm submission does not match this event',403);
  const answers=submission.answers;
  if (!answers || typeof answers!=='object' || Array.isArray(answers)) fail('JotForm answers are unavailable',502);
  const pretty=Object.values(answers).filter(a=>a?.text && a.answer!=null)
    .map(a=>`${a.text}:${typeof a.answer==='object'?Object.values(a.answer).filter(Boolean).join(' '):a.answer}`).join(', ');
  return {formID,submissionID,answers,pretty,submittedAt:submission.created_at,source:'jotform-api'};
}
module.exports={fetchTrustedJotformSubmission};
