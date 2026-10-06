


const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
];

const form = document.getElementById('resume-form');
const generateBtn = document.getElementById('generate-btn');
const targetRoleInput = document.getElementById('target-role');
const backgroundInput = document.getElementById('background-text');
const formError = document.getElementById('form-error');
const dashboard = document.getElementById('dashboard');
const resumePreview = document.getElementById('resume-preview');
const matchProbabilityEl = document.getElementById('match-probability');
const presentSkillsEl = document.getElementById('present-skills');
const missingSkillsEl = document.getElementById('missing-skills');
const downloadPdfBtn = document.getElementById('download-pdf');

function showError(message) {
  formError.hidden = false;
  formError.textContent = message;
}

function clearError() {
  formError.hidden = true;
  formError.textContent = '';
}

function setLoading(isLoading) {
  generateBtn.disabled = isLoading;
  generateBtn.textContent = isLoading ? 'Generating…' : 'Generate Resume';
}

function extractJsonText(raw) {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function renderSkills(listEl, skills) {
  listEl.innerHTML = '';
  if (!Array.isArray(skills) || skills.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'None listed';
    listEl.appendChild(empty);
    return;
  }

  skills.forEach((skill) => {
    const item = document.createElement('li');
    item.textContent = String(skill);
    listEl.appendChild(item);
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'resume';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(prompt) {
  let lastError;

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let response;

      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': API_KEY,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.4,
              },
            }),
          }
        );
      } catch (networkError) {
        lastError = networkError;
        await sleep(1000 * 2 ** attempt);
        continue;
      }

      const payload = await response.json().catch(() => ({}));

      if (response.ok) return payload;

      lastError = new Error(
        payload?.error?.message || `Request failed (${response.status})`
      );

      // Model ID not available: skip straight to the next model.
      if (response.status === 404) break;

      // Anything other than overload / rate limit is a real error (bad key, bad request).
      if (![429, 500, 503].includes(response.status)) throw lastError;

      await sleep(1000 * 2 ** attempt);
    }
  }

  throw lastError || new Error('Could not reach the model. Please try again.');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const targetRole = targetRoleInput.value.trim();
  const background = backgroundInput.value.trim();

  if (!targetRole || !background) {
    showError('Please enter a target role and your background text.');
    return;
  }

  if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
    showError('Add your Gemini API key in app.js (const API_KEY) before generating.');
    return;
  }

  setLoading(true);

  const prompt = [
    'You are an ATS resume writer and skill-gap analyst.',
    `Target role and company: ${targetRole}`,
    `Candidate background:\n${background}`,
    'Rewrite the candidate material into a professional, ATS-friendly resume.',
    'Return STRICT JSON only (no markdown) with this shape:',
    '{',
    '  "rewritten_resume_html": "semantic HTML fragment using h1/h2, p, ul/li; no html/head/body tags",',
    '  "match_probability": 0,',
    '  "present_skills": ["skill"],',
    '  "missing_skills": ["skill"]',
    '}',
    'match_probability must be an integer from 0 to 100.',
    'present_skills are skills evidenced in the background that fit the target role.',
    'missing_skills are important skills for the target role that are not evidenced.',
  ].join('\n');

  try {
    const payload = await callGemini(prompt);

    const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('The model returned an empty response.');
    }

    const parsed = JSON.parse(extractJsonText(rawText));
    const html = parsed.rewritten_resume_html;
    const match = Number.parseInt(parsed.match_probability, 10);

    if (typeof html !== 'string' || !html.trim()) {
      throw new Error('Resume HTML was missing from the model response.');
    }

    resumePreview.innerHTML = html;
    matchProbabilityEl.textContent = Number.isFinite(match) ? String(match) : '—';
    renderSkills(presentSkillsEl, parsed.present_skills);
    renderSkills(missingSkillsEl, parsed.missing_skills);
    dashboard.hidden = false;
    dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const message = error.message || '';
    if (/demand|overload|unavailable|try again/i.test(message)) {
      showError("Google's AI is busy right now. Please try again in a minute.");
    } else {
      showError(message || 'Could not generate the resume. Please try again.');
    }
  } finally {
    setLoading(false);
  }
});

downloadPdfBtn.addEventListener('click', () => {
  if (!resumePreview.innerHTML.trim()) {
    showError('Generate a resume before downloading a PDF.');
    return;
  }

  const filename = `${slugify(targetRoleInput.value.trim())}-resume.pdf`;

  resumePreview.classList.add('pdf-export');
  const cleanup = () => resumePreview.classList.remove('pdf-export');

  html2pdf()
    .set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    })
    .from(resumePreview)
    .save()
    .then(cleanup)
    .catch(cleanup);
});
