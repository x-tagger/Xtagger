/**
 * @file onboarding/main.ts
 * @layer UI / Onboarding
 * @description First-run walkthrough page.
 * Opened as a tab by the background worker on fresh install.
 * Shows a 3-step guide: hover to tag → manage in popup → share with XTAG.
 * Closes itself when the user clicks "Got it" or navigates away.
 */

const STEPS = [
  {
    icon: '🏷️',
    title: 'Hover over any username',
    body: 'On X.com, hover your mouse over any username or display name. A small <strong>🏷️ tag icon</strong> will appear next to it.',
    img: null,
  },
  {
    icon: '✏️',
    title: 'Add a tag',
    body: 'Click the 🏷️ icon to open the tag editor. Give the tag a <strong>name</strong>, pick a <strong>colour</strong>, and optionally add a note. Click <em>Add tag</em>.',
    img: null,
  },
  {
    icon: '👁️',
    title: 'Tags appear in your feed',
    body: 'Coloured dots (or pills) will now appear next to that person\'s name <strong>everywhere</strong> they appear on X.com — in your feed, replies, search results.',
    img: null,
  },
  {
    icon: '📤',
    title: 'Share your collections',
    body: 'Click the XTagger icon in your toolbar, then <em>Export</em>. Copy the compact <strong>XTAG:</strong> string and share it with a friend — they can paste it straight into their Import screen.',
    img: null,
  },
] as const;

let currentStep = 0;

function renderStep(step: number): void {
  const s = STEPS[step];
  if (!s) return;

  const total = STEPS.length;
  const isLast = step === total - 1;

  (document.getElementById('step-icon')  as HTMLElement).textContent = s.icon;
  (document.getElementById('step-title') as HTMLElement).textContent = s.title;
  (document.getElementById('step-body')  as HTMLElement).innerHTML   = s.body;

  // Progress dots
  const dots = document.querySelectorAll('.dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === step));

  // Buttons
  (document.getElementById('btn-back') as HTMLButtonElement).disabled = step === 0;
  const nextBtn = document.getElementById('btn-next') as HTMLButtonElement;
  nextBtn.textContent = isLast ? '🎉 Got it!' : 'Next →';
  nextBtn.classList.toggle('btn-finish', isLast);

  // Step counter
  (document.getElementById('step-counter') as HTMLElement).textContent = `${step + 1} / ${total}`;
}

function init(): void {
  // Build progress dots
  const dotsContainer = document.getElementById('dots')!;
  STEPS.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.setAttribute('aria-label', `Step ${i + 1}`);
    dot.addEventListener('click', () => {
      currentStep = i;
      renderStep(currentStep);
    });
    dotsContainer.appendChild(dot);
  });

  // Navigation buttons
  document.getElementById('btn-back')?.addEventListener('click', () => {
    if (currentStep > 0) { currentStep--; renderStep(currentStep); }
  });

  document.getElementById('btn-next')?.addEventListener('click', () => {
    if (currentStep < STEPS.length - 1) {
      currentStep++;
      renderStep(currentStep);
    } else {
      // Last step — open X.com and close this tab
      chrome.tabs.create({ url: 'https://x.com/home' });
      window.close();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (currentStep < STEPS.length - 1) { currentStep++; renderStep(currentStep); }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (currentStep > 0) { currentStep--; renderStep(currentStep); }
    }
  });

  renderStep(0);
}

init();
