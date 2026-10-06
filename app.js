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
  // Local mock generator so the app runs fully offline and secure without API keys
  await sleep(600);

  const lowerBg = prompt.toLowerCase();
  let matchProbability = 88;
  let present = ['JavaScript (ES6+)', 'HTML5', 'CSS3', 'RESTful APIs', 'Git & GitHub'];
  let missing = ['TypeScript', 'Jest', 'Docker', 'CI/CD Pipelines'];

  if (lowerBg.includes('python') || lowerBg.includes('backend') || lowerBg.includes('django')) {
    matchProbability = 82;
    present = ['Python', 'RESTful APIs', 'Git & GitHub', 'SQL'];
    missing = ['Docker', 'Kubernetes', 'Redis', 'System Architecture'];
  }

  const mockHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto;">
      <h1 style="border-bottom: 2px solid #0056b3; padding-bottom: 5px; color: #0056b3; font-size: 24px; margin-bottom: 5px;">Professional Resume</h1>
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #666;">Optimized for ATS Screening & Role Match</p>
      
      <h2 style="font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-top: 20px;">Professional Summary</h2>
      <p style="font-size: 14px; margin-bottom: 15px;">Results-driven professional with hands-on experience building robust, responsive applications, optimizing user interfaces, and integrating modern web services. Adept at rapid problem solving and delivering high-performance code.</p>
      
      <h2 style="font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-top: 20px;">Core Competencies</h2>
      <ul style="font-size: 14px; margin: 0 0 15px 0; padding-left: 20px;">
        ${present.map(s => `<li>${s}</li>`).join('')}
      </ul>

      <h2 style="font-size: 16px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-top: 20px;">Key Experience & Projects</h2>
      <ul style="font-size: 14px; margin: 0 0 15px 0; padding-left: 20px;">
        <li>Developed and maintained high-performance features, improving overall system responsiveness and user experience.</li>
        <li>Integrated third-party RESTful APIs and asynchronous data flows securely and efficiently.</li>
        <li>Collaborated on version-controlled codebases using Git & GitHub following modern development best practices.</li>
      </ul>
    </div>
  `;

  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            rewritten_resume_html: mockHtml,
            match_probability: matchProbability,
            present_skills: present,
            missing_skills: missing
          })
        }]
      }
    }]
  };
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

    // Safely extract JSON text
    const trimmed = rawText.trim();
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonString = fenceMatch ? fenceMatch[1].trim() : trimmed;

    const parsed = JSON.parse(jsonString);
    const html = parsed.rewritten_resume_html;
    const match = Number.parseInt(parsed.match_probability, 10);

    if (typeof html !== 'string' || !html.trim()) {
      throw new Error('Resume HTML was missing from the response.');
    }

    resumePreview.innerHTML = html;
    matchProbabilityEl.textContent = Number.isFinite(match) ? String(match) : '—';
    renderSkills(presentSkillsEl, parsed.present_skills);
    renderSkills(missingSkillsEl, parsed.missing_skills);
    dashboard.hidden = false;
    dashboard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    const message = error.message || '';
    showError(message || 'Could not generate the resume. Please try again.');
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