// =========================================================
// Aroma Cafe Customer Survey - Logic & State Engine (RTL)
// =========================================================

(function() {
  'use strict';

  // Application State
  const state = {
    settings: {},
    branches: [],
    questions: [],
    currentSectionIndex: 0,
    branchId: '',
    tableNumber: '',
    ratings: {},
    answers: {},
    startTime: Date.now(),
    isSubmitting: false,
    skippedSections: new Set()
  };

  // Arabic rating captions for 1-5 stars
  const STAR_CAPTIONS = {
    1: '😞 سيء جداً ولا يرقى للتوقع',
    2: '🙁 أقل من المتوقع ويحتاج تحسين',
    3: '😐 مقبول وعادي',
    4: '😊 رائع وممتاز جداً',
    5: '🌟 استثنائي ومبهر ويفوق الوصف!'
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // DOM Elements
  const elProgressContainer = document.getElementById('progress-container');
  const elSectionCounter = document.getElementById('section-counter');
  const elProgressBarFill = document.getElementById('progress-bar-fill');
  const elSurveyContent = document.getElementById('survey-content');
  const elBtnPrev = document.getElementById('btn-prev');
  const elBtnNext = document.getElementById('btn-next');
  const elBtnSkip = document.getElementById('btn-skip');
  const elFooterNav = document.getElementById('footer-nav');
  const elBranchHeaderSelect = document.getElementById('branch-select-header');
  const elQrModal = document.getElementById('qr-modal');

  // Initialize
  async function init() {
    // Parse URL params (e.g. ?branch=branch-2&table=4)
    const urlParams = new URLSearchParams(window.location.search);
    const branchParam = urlParams.get('branch');
    const tableParam = urlParams.get('table');

    if (tableParam) state.tableNumber = tableParam;

    try {
      const response = await fetch('/api/config');
      const result = await response.json();
      if (!result.success) throw new Error(result.message);

      state.settings = result.data.settings || {};
      state.branches = result.data.branches || [];
      state.questions = result.data.questions || [];

      // Determine initial branch
      if (branchParam && state.branches.some(b => b.id === branchParam)) {
        state.branchId = branchParam;
      } else if (state.branches.length > 0) {
        state.branchId = state.branches[0].id;
      }

      setupBranchDropdown();
      setupEventListeners();
      renderCurrentSection();
    } catch (err) {
      console.error('Initialization error:', err);
      elSurveyContent.innerHTML = `
        <div style="text-align: center; padding: 40px 16px;">
          <h3 style="color: #d32f2f; margin-bottom: 10px;">عذراً، حدث خطأ أثناء تحميل الاستبيان</h3>
          <p style="color: #666; margin-bottom: 20px;">يرجى التأكد من اتصال الخادم وإعادة المحاولة.</p>
          <button class="btn-nav btn-primary" onclick="location.reload()">إعادة المحاولة 🔄</button>
        </div>
      `;
    }
  }

  function setupBranchDropdown() {
    if (!elBranchHeaderSelect) return;
    elBranchHeaderSelect.innerHTML = '';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.city})`;
      if (b.id === state.branchId) opt.selected = true;
      elBranchHeaderSelect.appendChild(opt);
    });

    elBranchHeaderSelect.addEventListener('change', (e) => {
      state.branchId = e.target.value;
    });
  }

  function setupEventListeners() {
    elBtnPrev.addEventListener('click', handlePrevious);
    elBtnNext.addEventListener('click', handleNext);
    elBtnSkip.addEventListener('click', handleSkipSection);

    // QR modal listeners
    const btnShowQr = document.getElementById('btn-show-qr');
    const btnCloseQr = document.getElementById('btn-close-qr');
    if (btnShowQr) {
      btnShowQr.addEventListener('click', () => openQrModal());
    }
    if (btnCloseQr) {
      btnCloseQr.addEventListener('click', () => closeQrModal());
    }
    if (elQrModal) {
      elQrModal.addEventListener('click', (e) => {
        if (e.target === elQrModal) closeQrModal();
      });
    }

    const btnPrintQr = document.getElementById('btn-print-qr');
    if (btnPrintQr) {
      btnPrintQr.addEventListener('click', () => window.print());
    }
  }

  // Render current section
  function renderCurrentSection() {
    const totalSections = state.questions.length;
    const currentSection = state.questions[state.currentSectionIndex];
    if (!currentSection) return;

    // Update Progress
    const progressPercent = Math.round(((state.currentSectionIndex + 1) / totalSections) * 100);
    elSectionCounter.textContent = `القسم ${state.currentSectionIndex + 1} من ${totalSections} • ${currentSection.title}`;
    elProgressBarFill.style.width = `${progressPercent}%`;

    // Navigation buttons state
    elBtnPrev.style.display = state.currentSectionIndex === 0 ? 'none' : 'inline-flex';
    elBtnSkip.style.display = currentSection.skippable ? 'inline-flex' : 'none';

    if (state.currentSectionIndex === totalSections - 1) {
      elBtnNext.innerHTML = 'إرسال التقييم والحصول على الهدية 🎁';
      elBtnNext.classList.add('btn-submit');
    } else {
      elBtnNext.innerHTML = 'التالي ➔';
      elBtnNext.classList.remove('btn-submit');
    }

    // Build Section HTML
    let html = `
      <div class="section-meta">
        <span class="section-tag">${currentSection.sectionKey.toUpperCase()}</span>
        <h2 class="section-title">${currentSection.title}</h2>
        <p class="section-desc">${currentSection.description}</p>
      </div>
    `;

    // If first section, inject Branch picker selector
    if (state.currentSectionIndex === 0) {
      const activeBranch = state.branches.find(b => b.id === state.branchId) || state.branches[0];
      const activePhoneDisplay = activeBranch?.whatsappDisplay || (activeBranch?.id === 'branch-2' ? '+966 54 873 1474' : '00966567833138');

      html += `
        <div class="branch-selector-box">
          <label for="survey-branch-picker">📍 اختر الفرع الذي قمت بزيارته:</label>
          <select id="survey-branch-picker" class="branch-select">
            ${state.branches.map(b => `
              <option value="${b.id}" ${b.id === state.branchId ? 'selected' : ''}>
                ${b.name} - ${b.address || b.city}
              </option>
            `).join('')}
          </select>
          <div id="branch-whatsapp-indicator" style="margin-top: 10px; font-size: 0.85rem; color: #15803d; background: #f0fdf4; border: 1.5px solid #86efac; padding: 7px 12px; border-radius: 8px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
            <span>🟢 توجيه واتساب المعتمد لمشرف الفرع:</span>
            <strong id="branch-whatsapp-phone" style="direction: ltr; font-weight: 800; font-size: 0.95rem;">${activePhoneDisplay}</strong>
          </div>
          ${state.tableNumber ? `<div style="font-size: 0.85rem; color: var(--accent); font-weight: 700; margin-top: 6px;">☕ مرحباً بك على الطاولة رقم: ${state.tableNumber}</div>` : ''}
        </div>
      `;
    }

    // Render questions in section
    html += `<div class="questions-list">`;
    currentSection.questions.forEach((q, qIndex) => {
      // Check conditional visibility for food section
      let isHidden = false;
      if (currentSection.id === 'sec_food' && q.id !== 'ordered_food') {
        const ordered = state.ratings['ordered_food'];
        if (ordered === false) isHidden = true;
      }

      html += `
        <div class="question-block ${isHidden ? 'hidden-conditionally' : ''}" id="q-block-${q.id}" style="${isHidden ? 'display: none;' : ''}">
          <label class="question-label" for="q-input-${q.id}">
            ${q.required ? '<span class="question-required">*</span>' : ''}
            ${q.label}
          </label>
          <div class="question-input-wrapper">
            ${renderQuestionInput(q)}
          </div>
          <div class="validation-hint" id="hint-${q.id}">يرجى الإجابة على هذا السؤال للمتابعة</div>
        </div>
      `;
    });
    html += `</div>`;

    // If food section and ordered_food is false, show skip banner
    if (currentSection.id === 'sec_food' && state.ratings['ordered_food'] === false) {
      html += `
        <div class="skip-banner" id="food-skip-banner">
          <span>☕ بما أنك لم تطلب أطعمة، تم تخطي هذا القسم تلقائياً. اضغط "التالي" للمتابعة.</span>
        </div>
      `;
    }

    elSurveyContent.innerHTML = html;

    // Attach listeners for newly rendered questions
    attachQuestionListeners(currentSection);

    // Sync first section branch picker if present
    const branchPicker = document.getElementById('survey-branch-picker');
    if (branchPicker) {
      branchPicker.addEventListener('change', (e) => {
        state.branchId = e.target.value;
        if (elBranchHeaderSelect) elBranchHeaderSelect.value = e.target.value;
        const selectedBranch = state.branches.find(b => b.id === state.branchId);
        const phoneElem = document.getElementById('branch-whatsapp-phone');
        if (phoneElem && selectedBranch) {
          phoneElem.textContent = selectedBranch.whatsappDisplay || (selectedBranch.id === 'branch-2' ? '+966 54 873 1474' : '00966567833138');
        }
      });
    }

    // Scroll to top of card smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Render Question Inputs by Type
  function renderQuestionInput(q) {
    if (q.type === 'stars') {
      const currentVal = state.ratings[q.id] || 0;
      return `
        <div class="star-rating-wrapper" data-qid="${q.id}">
          <div class="stars-container" role="radiogroup" aria-label="${q.label}">
            ${[1, 2, 3, 4, 5].map(num => `
              <button type="button" class="star-btn ${num <= currentVal ? 'active' : ''}" data-val="${num}" aria-label="${num} نجوم">
                ★
              </button>
            `).join('')}
          </div>
          <div class="rating-caption" id="caption-${q.id}">
            ${currentVal ? STAR_CAPTIONS[currentVal] : 'اختر التقييم المناسب'}
          </div>
        </div>
      `;
    }

    if (q.type === 'nps') {
      const currentVal = state.ratings[q.id] !== undefined ? state.ratings[q.id] : null;
      return `
        <div class="nps-container" data-qid="${q.id}">
          <div class="nps-pills">
            ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => `
              <button type="button" class="nps-btn ${currentVal === num ? 'active' : ''}" data-val="${num}">
                ${num}
              </button>
            `).join('')}
          </div>
          <div class="nps-labels">
            <span>0: مستبعد تماماً ❌</span>
            <span>5: محايد</span>
            <span>10: بالتأكيد وبشدة 🌟</span>
          </div>
        </div>
      `;
    }

    if (q.type === 'choice') {
      const currentVal = state.answers[q.id] || '';
      const isBeverage = q.id === 'beverage_type' || q.allowCustomInput;

      let html = `
        <div class="choice-grid" data-qid="${q.id}">
          ${(q.options || []).map(opt => `
            <button type="button" class="choice-chip ${currentVal === opt ? 'active' : ''}" data-val="${escapeHtml(opt)}">
              <span>${opt}</span>
              <span class="chip-check"></span>
            </button>
          `).join('')}
        </div>
      `;

      if (isBeverage) {
        html += `
          <div class="custom-choice-input-box" style="margin-top: 14px; background: #faf7f2; border: 1.5px dashed var(--accent); border-radius: var(--radius-sm); padding: 12px 14px;">
            <label for="q-custom-${q.id}" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.88rem; font-weight: 700; color: var(--primary); margin-bottom: 8px;">
              <span>✍️ أو اكتب اسم مشروبك هنا مباشرة:</span>
              <span style="font-size: 0.78rem; color: var(--accent); font-weight: 700; background: var(--accent-light); padding: 2px 8px; border-radius: 4px;">كتابة حرة</span>
            </label>
            <input type="text" id="q-custom-${q.id}" class="input-field" 
              placeholder="مثال: شاي مغربي بالنعناع، فلات وايت، كيمكس، موكا، كورتادو، كركديه..." 
              value="${escapeHtml(currentVal)}"
              style="background: #ffffff; border-color: var(--accent); font-size: 0.95rem; font-weight: 600;">
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;">
              💡 يمكنك اختيار مشروبك من الأزرار أعلاه أو كتابة أي مشروب آخر طلبته هنا.
            </div>
          </div>
        `;
      }

      return html;
    }

    if (q.type === 'boolean') {
      const currentVal = state.ratings[q.id] !== undefined ? state.ratings[q.id] : (state.answers[q.id] !== undefined ? state.answers[q.id] : null);
      return `
        <div class="boolean-cards" data-qid="${q.id}">
          <button type="button" class="bool-btn ${currentVal === true ? 'active' : ''}" data-val="true">
            <span class="bool-icon">✨ نعم</span>
            <span>نعم، قمت بالطلب</span>
          </button>
          <button type="button" class="bool-btn ${currentVal === false ? 'active' : ''}" data-val="false">
            <span class="bool-icon">☕ لا</span>
            <span>لا، مشروبات فقط</span>
          </button>
        </div>
      `;
    }

    if (q.type === 'text') {
      const currentVal = state.answers[q.id] || '';
      return `
        <textarea id="q-input-${q.id}" class="textarea-field" placeholder="${q.placeholder || 'اكتب ملاحظاتك بحرية هنا...'}" rows="3">${currentVal}</textarea>
      `;
    }

    if (q.type === 'input') {
      const currentVal = state.answers[q.id] || '';
      return `
        <input type="text" id="q-input-${q.id}" class="input-field" placeholder="${q.placeholder || ''}" value="${currentVal}">
      `;
    }

    return '';
  }

  // Attach dynamic event listeners for inputs
  function attachQuestionListeners(currentSection) {
    currentSection.questions.forEach(q => {
      // 1. Star Rating
      if (q.type === 'stars') {
        const wrapper = document.querySelector(`.star-rating-wrapper[data-qid="${q.id}"]`);
        if (!wrapper) return;
        const starBtns = wrapper.querySelectorAll('.star-btn');
        const caption = wrapper.querySelector('.rating-caption');

        starBtns.forEach(btn => {
          btn.addEventListener('mouseenter', () => {
            const val = parseInt(btn.dataset.val);
            starBtns.forEach(b => {
              const bVal = parseInt(b.dataset.val);
              b.classList.toggle('hovered', bVal <= val);
            });
            caption.textContent = STAR_CAPTIONS[val];
          });

          btn.addEventListener('mouseleave', () => {
            starBtns.forEach(b => b.classList.remove('hovered'));
            const savedVal = state.ratings[q.id];
            caption.textContent = savedVal ? STAR_CAPTIONS[savedVal] : 'اختر التقييم المناسب';
          });

          btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val);
            state.ratings[q.id] = val;
            starBtns.forEach(b => {
              const bVal = parseInt(b.dataset.val);
              b.classList.toggle('active', bVal <= val);
            });
            caption.textContent = STAR_CAPTIONS[val];
            hideValidationHint(q.id);
          });
        });
      }

      // 2. NPS scale
      if (q.type === 'nps') {
        const wrapper = document.querySelector(`.nps-container[data-qid="${q.id}"]`);
        if (!wrapper) return;
        const npsBtns = wrapper.querySelectorAll('.nps-btn');

        npsBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const val = parseInt(btn.dataset.val);
            state.ratings[q.id] = val;
            npsBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            hideValidationHint(q.id);
          });
        });
      }

      // 3. Choice options (with free-text custom writing support)
      if (q.type === 'choice') {
        const wrapper = document.querySelector(`.choice-grid[data-qid="${q.id}"]`);
        const customInput = document.getElementById(`q-custom-${q.id}`);
        const chips = wrapper ? wrapper.querySelectorAll('.choice-chip') : [];

        chips.forEach(chip => {
          chip.addEventListener('click', () => {
            const val = chip.dataset.val;
            state.answers[q.id] = val;
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            if (customInput) {
              customInput.value = val;
            }
            hideValidationHint(q.id);
          });
        });

        if (customInput) {
          customInput.addEventListener('input', (e) => {
            const typedVal = e.target.value.trim();
            state.answers[q.id] = typedVal;
            // Activate chip if exact match found, else deactivate chips
            chips.forEach(c => {
              if (typedVal && c.dataset.val.toLowerCase() === typedVal.toLowerCase()) {
                c.classList.add('active');
              } else {
                c.classList.remove('active');
              }
            });
            hideValidationHint(q.id);
          });
        }
      }

      // 4. Boolean toggle (special support for conditional food skipping)
      if (q.type === 'boolean') {
        const wrapper = document.querySelector(`.boolean-cards[data-qid="${q.id}"]`);
        if (!wrapper) return;
        const boolBtns = wrapper.querySelectorAll('.bool-btn');

        boolBtns.forEach(btn => {
          btn.addEventListener('click', () => {
            const val = btn.dataset.val === 'true';
            state.ratings[q.id] = val;
            state.answers[q.id] = val;
            boolBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            hideValidationHint(q.id);

            // Handle conditional food section branching
            if (q.id === 'ordered_food') {
              handleFoodBranching(val);
            }
          });
        });
      }

      // 5. Text & Input fields
      if (q.type === 'text' || q.type === 'input') {
        const input = document.getElementById(`q-input-${q.id}`);
        if (input) {
          input.addEventListener('input', (e) => {
            state.answers[q.id] = e.target.value.trim();
          });
        }
      }
    });
  }

  // Handle conditional food branching
  function handleFoodBranching(didOrderFood) {
    const foodQuestions = ['food_taste', 'food_freshness', 'portion_size', 'food_variety'];
    foodQuestions.forEach(fId => {
      const block = document.getElementById(`q-block-${fId}`);
      if (block) {
        block.style.display = didOrderFood ? 'block' : 'none';
      }
    });

    let banner = document.getElementById('food-skip-banner');
    if (!didOrderFood) {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'skip-banner';
        banner.id = 'food-skip-banner';
        banner.innerHTML = '<span>☕ بما أنك لم تطلب أطعمة، تم تخطي هذا القسم تلقائياً. اضغط "التالي" للمتابعة.</span>';
        document.querySelector('.questions-list').appendChild(banner);
      } else {
        banner.style.display = 'flex';
      }
    } else {
      if (banner) banner.style.display = 'none';
    }
  }

  // Validation
  function validateCurrentSection() {
    const currentSection = state.questions[state.currentSectionIndex];
    if (!currentSection) return true;

    let isValid = true;
    let firstInvalidId = null;

    currentSection.questions.forEach(q => {
      // If food was skipped, do not validate sub-questions
      if (currentSection.id === 'sec_food' && state.ratings['ordered_food'] === false && q.id !== 'ordered_food') {
        return;
      }

      if (q.required) {
        let hasValue = false;
        if (q.type === 'stars' || q.type === 'nps') {
          hasValue = state.ratings[q.id] !== undefined && state.ratings[q.id] !== null;
        } else if (q.type === 'choice') {
          hasValue = Boolean(state.answers[q.id]);
        } else if (q.type === 'boolean') {
          hasValue = state.ratings[q.id] !== undefined && state.ratings[q.id] !== null;
        } else if (q.type === 'input' || q.type === 'text') {
          hasValue = Boolean(state.answers[q.id]);
        }

        if (!hasValue) {
          isValid = false;
          showValidationHint(q.id);
          if (!firstInvalidId) firstInvalidId = q.id;
        } else {
          hideValidationHint(q.id);
        }
      }
    });

    if (firstInvalidId) {
      const elem = document.getElementById(`q-block-${firstInvalidId}`);
      if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return isValid;
  }

  function showValidationHint(qid) {
    const hint = document.getElementById(`hint-${qid}`);
    if (hint) hint.classList.add('show');
  }

  function hideValidationHint(qid) {
    const hint = document.getElementById(`hint-${qid}`);
    if (hint) hint.classList.remove('show');
  }

  // Navigation handlers
  function handlePrevious() {
    if (state.currentSectionIndex > 0) {
      state.currentSectionIndex--;
      renderCurrentSection();
    }
  }

  async function handleNext() {
    if (!validateCurrentSection()) return;

    const totalSections = state.questions.length;
    if (state.currentSectionIndex < totalSections - 1) {
      state.currentSectionIndex++;
      renderCurrentSection();
    } else {
      // Final section -> Submit!
      await submitSurvey();
    }
  }

  function handleSkipSection() {
    const totalSections = state.questions.length;
    state.skippedSections.add(state.questions[state.currentSectionIndex].id);
    if (state.currentSectionIndex < totalSections - 1) {
      state.currentSectionIndex++;
      renderCurrentSection();
    }
  }

  // Submit Survey
  async function submitSurvey() {
    if (state.isSubmitting) return;
    state.isSubmitting = true;

    elBtnNext.disabled = true;
    elBtnNext.innerHTML = 'جاري إرسال التقييم... ⏳';

    const payload = {
      branchId: state.branchId,
      ratings: state.ratings,
      answers: state.answers,
      durationSeconds: Math.round((Date.now() - state.startTime) / 1000)
    };

    try {
      const response = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.message);

      renderThankYouScreen(result.data);
    } catch (err) {
      console.error('Submission failed:', err);
      alert('حدث خطأ أثناء إرسال التقييم: ' + err.message);
      elBtnNext.disabled = false;
      elBtnNext.innerHTML = 'إرسال التقييم والحصول على الهدية 🎁';
      state.isSubmitting = false;
    }
  }

  // Render Thank You Screen
  function renderThankYouScreen(data) {
    // Hide progress bar and footer nav
    if (elProgressContainer) elProgressContainer.style.display = 'none';
    if (elFooterNav) elFooterNav.style.display = 'none';

    // Trigger celebratory confetti
    if (window.confetti) {
      window.confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
    }

    const voucherCode = data.voucherCode || state.settings.discountRewardCode || 'MAWAL10';
    const discountPercent = state.settings.discountRewardPercent || 10;
    const branchObj = state.branches.find(b => b.id === state.branchId) || state.branches[0];

    elSurveyContent.innerHTML = `
      <div class="thankyou-wrapper">
        <div class="thankyou-icon">✓</div>
        <h2 class="thankyou-title">شكراً لمشاركتك القيّمة!</h2>
        <p class="thankyou-subtitle">
          رأيك أمانة نصنع بها تجربة استثنائية لك في <strong>${branchObj ? branchObj.name : 'مقهى موال مراكش'}</strong> بالمدينة المنورة. يسعدنا تقديم هذه الهدية الرمزية لزيارتك القادمة:
        </p>

        <!-- Voucher Card -->
        <div class="voucher-card">
          <span class="voucher-badge">قسيمة شكر وتقدير خاصة بك</span>
          <div class="voucher-discount">خصم ${discountPercent}% على فاتورتك القادمة</div>
          <div class="voucher-code-box">
            <span class="voucher-code-text" id="voucher-code-text">${voucherCode}</span>
            <button class="btn-copy-code" id="btn-copy-code" onclick="navigator.clipboard.writeText('${voucherCode}').then(() => { this.textContent = 'تم النسخ! ✓'; setTimeout(() => this.textContent = 'نسخ الكود', 2000); })">
              نسخ الكود
            </button>
          </div>
          <div class="voucher-notes">أظهر هذا الكود للباريستا عند الدفع خلال 30 يوماً للاستفادة من الخصم.</div>
        </div>

        <!-- WhatsApp Branch Routing Card -->
        ${data.whatsappUrl ? `
        <div class="whatsapp-routing-card">
          <div class="whatsapp-header-row">
            <span class="whatsapp-badge">🟢 تم توجيه التقييم لواتساب الفرع</span>
            <span class="whatsapp-target-branch">📍 ${data.branchName || branchObj?.name}</span>
          </div>
          <div class="whatsapp-card-text">
            حرصاً على متابعة رضاكم فورياً، تم ربط تقييمك مع <strong>${data.managerName || 'مشرف الفرع'}</strong> على الرقم: <strong style="direction: ltr; display: inline-block;">${data.managerPhone || ''}</strong>.
          </div>
          <a href="${data.whatsappUrl}" target="_blank" class="btn-whatsapp-direct" id="btn-send-whatsapp">
            <span>📲 إرسال ملخص تقييمك لواتساب الفرع بنقرة واحدة</span>
          </a>
        </div>
        ` : ''}



        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 16px;">
          رقم مرجع تقييمك: <code>${data.id}</code>
        </div>
      </div>
    `;
  }

  // QR Modal functions
  function openQrModal() {
    if (!elQrModal) return;
    const branchObj = state.branches.find(b => b.id === state.branchId) || state.branches[0];
    const qrContainer = document.getElementById('table-qr-canvas');
    const qrBranchTitle = document.getElementById('qr-branch-title');

    if (qrBranchTitle && branchObj) {
      qrBranchTitle.textContent = `${branchObj.name} - ستاند الطاولة`;
    }

    if (qrContainer && window.QRCode) {
      qrContainer.innerHTML = '';
      const currentUrl = window.location.origin + window.location.pathname + `?branch=${state.branchId}`;
      new QRCode(qrContainer, {
        text: currentUrl,
        width: 170,
        height: 170,
        colorDark: '#1e1511',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    }

    elQrModal.classList.add('open');
  }

  function closeQrModal() {
    if (elQrModal) elQrModal.classList.remove('open');
  }

  // Expose init globally
  window.addEventListener('DOMContentLoaded', init);
})();
