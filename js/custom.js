// ==================== CUSTOM DECK FEATURE — custom.js ====================
// Runs only on custom.html. Uses window.AppState and shuffle() from shared.js.
// No ES modules — plain globals only.

(function () {
  'use strict';

  let currentCustomWords = []; // Bộ từ đang soạn
  let customHistory = [];      // Lịch sử các bộ từ đã lưu
  let selectedWord = null;     // Từ được chọn từ database

  // ==================== STORAGE ====================

  var USER_ID = 'default_user'; // fallback user id

  function persistWordsSentences(words) {
    if (!Array.isArray(words) || words.length === 0) return;
    try {
      var savedSentences = JSON.parse(localStorage.getItem('wq_custom_sentences') || '{}');
      var changed = false;
      words.forEach(function (rawW) {
        var w = typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(rawW) : rawW;
        if (w && w.h && (w.ex || w.e || w.exm || w.exp || w.tokens || (Array.isArray(w.examples) && w.examples.length))) {
          var key = String(w.h).trim();
          var entry = {
            ex: w.ex || w.e || '',
            exp: w.exp || '',
            exm: w.exm || '',
            p: w.p || '',
            m: w.m || ''
          };
          if (Array.isArray(w.tokens) && w.tokens.length) entry.tokens = w.tokens;
          if (w.blank) entry.blank = w.blank;
          if (Array.isArray(w.options) && w.options.length) entry.options = w.options;
          if (Array.isArray(w.examples) && w.examples.length) entry.examples = w.examples;

          savedSentences[key] = entry;
          if (window.WQ_SENTENCE_BANK) {
            window.WQ_SENTENCE_BANK[key] = Object.assign({}, window.WQ_SENTENCE_BANK[key] || {}, entry);
          }

          // Lưu luôn từng mảnh từ trong tokens (của câu chính và của mọi câu trong examples) vào từ điển tra nhanh
          var registerTokenList = function (tkList) {
            if (!Array.isArray(tkList)) return;
            tkList.forEach(function (tk) {
              if (tk && typeof tk === 'object') {
                var th = String(tk.h || tk.t || tk.w || '').trim();
                if (th && (tk.p || tk.m)) {
                  if (!savedSentences[th]) {
                    savedSentences[th] = { p: tk.p || '', m: tk.m || '' };
                  }
                  if (window.WQ_SENTENCE_BANK && !window.WQ_SENTENCE_BANK[th]) {
                    window.WQ_SENTENCE_BANK[th] = { p: tk.p || '', m: tk.m || '' };
                  }
                }
              }
            });
          };
          registerTokenList(w.tokens);
          if (Array.isArray(w.examples)) {
            w.examples.forEach(function (exObj) {
              if (exObj && Array.isArray(exObj.tokens)) registerTokenList(exObj.tokens);
            });
          }
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem('wq_custom_sentences', JSON.stringify(savedSentences));
      }
    } catch (e) { }
  }

  function loadCustomHistory() {
    // Load từ localStorage trước để hiển thị nhanh
    var localDecks = [];
    try {
      localDecks = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    } catch (e) {
      localDecks = [];
    }
    customHistory = localDecks.slice();
    renderCustomHistory();

    // Sau đó sync từ Cloudflare API nhưng vẫn giữ lại words & các bộ từ local chưa lên cloud
    if (window.WeiQuanAPI) {
      window.WeiQuanAPI.getDecks(USER_ID).then(function (res) {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          var cloudIds = {};
          var cloudDecks = res.data.map(function (d) {
            cloudIds[d.id] = true;
            var matchLocal = localDecks.find(function (ld) {
              return ld.cloudId === d.id || ld.id === d.id || (ld.name === d.name && Array.isArray(ld.words) && ld.words.length > 0);
            });
            var cachedWords = (matchLocal && Array.isArray(matchLocal.words)) ? matchLocal.words : [];
            return {
              id: d.id,
              cloudId: d.id,
              name: d.name,
              words: cachedWords,
              wordCount: d.word_count || cachedWords.length || 0,
              createdAt: (d.created_at || '').split('T')[0] || (matchLocal && matchLocal.createdAt) || new Date().toISOString().split('T')[0]
            };
          });

          // Giữ lại các bộ từ chỉ mới lưu ở local (chưa có cloudId)
          var unsyncedLocal = localDecks.filter(function (ld) {
            return !ld.cloudId && !cloudIds[ld.id] && !cloudDecks.some(function (cd) { return cd.name === ld.name; });
          });

          customHistory = unsyncedLocal.concat(cloudDecks);
          localStorage.setItem('wq_custom_decks', JSON.stringify(customHistory));
          renderCustomHistory();
        }
      }).catch(function (err) {
        console.warn('⚠️ Không thể load decks từ cloud:', err);
      });
    }
  }

  function saveCustomHistory() {
    localStorage.setItem('wq_custom_decks', JSON.stringify(customHistory));
  }

  // ==================== RENDER ====================

  function renderCustomHistory() {
    var list = document.getElementById('customHistoryList');
    if (!list) return;

    if (customHistory.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có lịch sử</div>';
      return;
    }

    list.innerHTML = '';
    customHistory.forEach(function (deckObj, index) {
      var item = document.createElement('div');
      item.className = 'custom-deck-history-item';
      item.innerHTML =
        '<div class="custom-deck-info">' +
        '<div class="custom-deck-title">' +
        '<span class="deck-name">' + deckObj.name + '</span>' +
        '<span class="custom-deck-badge">' + (deckObj.wordCount || (deckObj.words ? deckObj.words.length : 0)) + ' từ</span>' +
        '</div>' +
        '<div class="custom-deck-meta">' +
        '<span>' + deckObj.createdAt + '</span>' +
        '</div>' +
        '</div>' +
        '<div class="custom-deck-actions">' +
        '<button class="btn custom-deck-btn load" data-action="load">Tải lại</button>' +
        '<button class="btn custom-deck-btn study" data-action="study">Học</button>' +
        '<button class="custom-word-btn delete" data-action="delete" aria-label="Xóa bộ từ">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
        '</button>' +
        '</div>';

      item.querySelector('[data-action="load"]').onclick = function (e) {
        e.stopPropagation();
        // Nếu là cloud deck chưa có words, fetch trước
        if (deckObj.cloudId && (!deckObj.words || deckObj.words.length === 0)) {
          if (window.WeiQuanAPI) {
            window.WeiQuanAPI.getDeckById(deckObj.cloudId).then(function (res) {
              if (res && res.success && res.data && res.data.words) {
                deckObj.words = res.data.words;
                currentCustomWords = deckObj.words.slice();
                renderCustomWordsList();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (window.showToast) window.showToast('Đã tải "' + deckObj.name + '" (' + currentCustomWords.length + ' từ)', 'success');
              }
            }).catch(function () {
              if (window.showToast) window.showToast('❌ Không thể tải từ cloud!', 'error');
            });
          }
        } else {
          currentCustomWords = (deckObj.words || []).map(function (w) {
            return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w;
          });
          renderCustomWordsList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          if (window.showToast) window.showToast('Đã tải "' + deckObj.name + '" (' + currentCustomWords.length + ' từ)', 'success');
        }
      };

      item.querySelector('[data-action="study"]').onclick = async function (e) {
        e.stopPropagation();
        var targetId = deckObj.cloudId || deckObj.id;
        // Nếu là cloud deck chưa có words trong memory, fetch từ API
        if ((!deckObj.words || deckObj.words.length === 0) && targetId && window.WeiQuanAPI) {
          try {
            if (window.showToast) window.showToast('⏳ Đang tải từ vựng...', 'info');
            var res = await window.WeiQuanAPI.getDeckById(targetId);
            if (res && res.success && res.data && Array.isArray(res.data.words) && res.data.words.length > 0) {
              deckObj.words = res.data.words;
              saveCustomHistory();
            }
          } catch (err) {
            console.warn('Không thể tải chi tiết bộ từ từ server:', err);
          }
        }

        var words = (deckObj.words || []).map(function (w) {
          return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(w) : w;
        });

        if (words.length === 0) {
          if (window.showToast) window.showToast('Bộ từ này đang trống, chưa có từ vựng để học!', 'error');
          return;
        }

        deckObj.words = words;
        showStudyModeModal(deckObj);
      };

      item.querySelector('[data-action="delete"]').onclick = function (e) {
        e.stopPropagation();
        var confirmMsg = 'Bạn có chắc muốn xóa bộ từ "' + deckObj.name + '"?';
        var doDelete = function () {
          // Xóa theo id thay vì index (tránh lỗi khi index bị lệch)
          var idx = customHistory.findIndex(function (d) {
            return d.id === deckObj.id || (d.cloudId && d.cloudId === deckObj.cloudId);
          });
          if (idx !== -1) customHistory.splice(idx, 1);
          saveCustomHistory();
          renderCustomHistory();

          // Xóa trên Cloudflare nếu có cloudId
          if (deckObj.cloudId && window.WeiQuanAPI) {
            window.WeiQuanAPI.deleteDeck(deckObj.cloudId).catch(function (err) {
              console.warn('⚠️ Xóa cloud thất bại:', err);
            });
          }

          if (window.showToast) {
            window.showToast('Đã xóa "' + deckObj.name + '"', 'info');
          }
        };

        if (window.wqPopup) {
          window.wqPopup.confirm(confirmMsg, { title: 'Xóa bộ từ', icon: '🗑️' }).then(function (ok) {
            if (ok) doDelete();
          });
        } else if (confirm(confirmMsg)) {
          doDelete();
        }
      };

      list.appendChild(item);
    });
  }

  function renderCustomWordsList() {
    var list = document.getElementById('customWordsList');
    var count = document.getElementById('customWordCount');

    if (count) count.textContent = currentCustomWords.length;

    if (!list) return;

    if (currentCustomWords.length === 0) {
      list.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted);">Chưa có từ nào. Hãy tìm và thêm từ ở trên! 👆</div>';
      return;
    }

    list.innerHTML = '';
    currentCustomWords.forEach(function (word, index) {
      var ew = typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(word) : word;
      currentCustomWords[index] = ew;
      var exHtml = '';
      var exList = Array.isArray(ew.examples) && ew.examples.length > 0 ? ew.examples : (ew.ex ? [{ ex: ew.ex, exm: ew.exm }] : []);
      if (exList.length > 1) {
        exHtml = '<div style="margin-top: 6px; display: flex; flex-direction: column; gap: 3px;">' +
          '<div style="font-size: 0.74rem; font-weight: 700; color: var(--accent-purple);">🎲 ' + exList.length + ' câu ví dụ (sẽ random câu khi học):</div>' +
          exList.map(function (exObj, idxEx) {
            return '<div style="font-size: 0.79rem; color: var(--text-muted); font-style: italic; padding-left: 6px; border-left: 2px solid rgba(139,92,246,0.3);">' +
              (idxEx + 1) + '. ' + exObj.ex + (exObj.exm ? ' — <span style="color: var(--text-secondary);">' + exObj.exm + '</span>' : '') +
              '</div>';
          }).join('') +
          '</div>';
      } else if (exList.length === 1) {
        exHtml = '<div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; font-style: italic;">' +
          '💬 ' + exList[0].ex + (exList[0].exm ? ' — <span style="color: var(--text-secondary);">' + exList[0].exm + '</span>' : '') +
          '</div>';
      } else {
        exHtml = '<div style="font-size: 0.78rem; color: #f59e0b; margin-top: 4px;">⚠️ Chưa có câu ví dụ (bấm ✏️ để thêm)</div>';
      }

      var item = document.createElement('div');
      item.className = 'custom-word-item';
      item.innerHTML =
        '<div class="custom-word-info">' +
        '<div class="custom-word-main">' +
        '<span class="custom-word-hanzi">' + ew.h + '</span>' +
        '<span class="custom-word-pinyin">' + ew.p + '</span>' +
        '</div>' +
        '<span class="custom-word-meaning">' + ew.m + '</span>' +
        exHtml +
        '</div>' +
        '<div class="custom-word-actions">' +
        '<button class="custom-word-btn edit-ex" title="Thêm / Sửa câu ví dụ (hỗ trợ nhiều câu ngăn cách bởi ||)" aria-label="Sửa câu ví dụ" data-index="' + index + '">' +
        '✏️' +
        '</button>' +
        '<button class="custom-word-btn speak" aria-label="Speak" data-index="' + index + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>' +
        '</button>' +
        '<button class="custom-word-btn delete" aria-label="Delete" data-index="' + index + '">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
        '</button>' +
        '</div>';

      item.querySelector('.edit-ex').onclick = async function (e) {
        e.stopPropagation();
        var defaultEx = (Array.isArray(ew.examples) && ew.examples.length > 1)
          ? ew.examples.map(function (x) { return x.ex; }).join(' || ')
          : (ew.ex || '');
        var defaultExm = (Array.isArray(ew.examples) && ew.examples.length > 1)
          ? ew.examples.map(function (x) { return x.exm || ''; }).join(' || ')
          : (ew.exm || '');
        var newEx = defaultEx;
        var newExm = defaultExm;
        if (window.wqPopup) {
          var resEx = await window.wqPopup.prompt('Nhập câu ví dụ tiếng Trung cho từ "' + ew.h + '" (ngăn cách nhiều câu bằng dấu || để random khi học):', {
            title: 'Câu ví dụ tiếng Trung (Hỗ trợ nhiều câu)',
            icon: '💬',
            placeholder: 'Ví dụ: 我喜欢' + ew.h + '。 || 他也喜欢' + ew.h + '。',
            defaultValue: newEx
          });
          if (resEx === null) return;
          newEx = resEx.trim();
          var resExm = await window.wqPopup.prompt('Nhập nghĩa tiếng Việt tương ứng (ngăn cách bằng dấu || nếu có nhiều câu):', {
            title: 'Nghĩa câu ví dụ',
            icon: '🇻🇳',
            placeholder: 'Ví dụ: Tôi thích... || Anh ấy cũng thích...',
            defaultValue: newExm
          });
          if (resExm !== null) newExm = resExm.trim();
        } else {
          var p1 = prompt('Câu ví dụ tiếng Trung (ngăn cách nhiều câu bằng ||):', newEx);
          if (p1 === null) return;
          newEx = p1.trim();
          var p2 = prompt('Nghĩa tiếng Việt tương ứng (ngăn cách bằng ||):', newExm);
          if (p2 !== null) newExm = p2.trim();
        }
        var updatedWord = {
          h: ew.h,
          p: ew.p,
          m: ew.m,
          ex: newEx,
          exp: ew.exp || '',
          exm: newExm
        };
        currentCustomWords[index] = typeof window.enrichWordWithSentence === 'function'
          ? window.enrichWordWithSentence(updatedWord)
          : updatedWord;
        persistWordsSentences([currentCustomWords[index]]);
        renderCustomWordsList();
        if (window.showToast) window.showToast('✅ Đã cập nhật câu ví dụ cho "' + ew.h + '"', 'success');
      };

      item.querySelector('.speak').onclick = function (e) {
        e.stopPropagation();
        if (typeof speak === 'function') speak(ew.h);
      };

      item.querySelector('.delete').onclick = function (e) {
        e.stopPropagation();
        currentCustomWords.splice(index, 1);
        renderCustomWordsList();
        if (window.showToast) {
          window.showToast('Đã xóa từ "' + word.h + '"', 'info');
        }
      };

      list.appendChild(item);
    });
  }

  // ==================== SEARCH ====================

  function removePinyinTonesLocal(str) {
    if (!str) return '';
    var toneMap = {
      'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
      'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
      'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
      'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
      'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
      'ü': 'u', 'ǘ': 'u', 'ǚ': 'u', 'ǜ': 'u'
    };
    return str.toLowerCase().split('').map(function (c) {
      return toneMap[c] || c;
    }).join('').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function searchInDatabase(query) {
    if (!query || typeof DATA === 'undefined' || Object.keys(DATA).length === 0) return [];
    var normQuery = removePinyinTonesLocal(query.toLowerCase());
    var results = [];
    Object.keys(DATA).forEach(function (lvl) {
      if (!DATA[lvl]) return;
      DATA[lvl].forEach(function (w) {
        var matchHanzi = w.h && w.h.toLowerCase().includes(query.toLowerCase());
        var matchMean = w.m && w.m.toLowerCase().includes(query.toLowerCase());
        var matchPinyin = w.p && (
          w.p.toLowerCase().includes(query.toLowerCase()) ||
          removePinyinTonesLocal(w.p).includes(normQuery)
        );
        if (matchHanzi || matchMean || matchPinyin) {
          if (!results.some(function (r) { return r.h === w.h; })) {
            results.push(Object.assign({}, w, { level: lvl }));
          }
        }
      });
    });
    return results.slice(0, 8);
  }

  function renderCustomSearchSuggestions(query) {
    var suggestionsBox = document.getElementById('customSearchSuggestions');
    var clearBtn = document.getElementById('customSearchClearBtn');
    if (!suggestionsBox) return;

    if (!query.trim()) {
      suggestionsBox.style.display = 'none';
      if (clearBtn) clearBtn.style.display = 'none';
      return;
    }

    if (clearBtn) clearBtn.style.display = 'flex';

    var results = searchInDatabase(query);

    if (results.length > 0) {
      suggestionsBox.innerHTML = '';
      results.forEach(function (w) {
        var div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML =
          '<div class="suggestion-header">' +
          '<span class="suggestion-hanzi">' + w.h + '</span>' +
          '<span class="suggestion-level">' + (w.level || '') + '</span>' +
          '</div>' +
          '<span class="suggestion-pinyin">' + w.p + '</span>' +
          '<span class="suggestion-mean">' + w.m + '</span>';
        div.onclick = function () { selectWordFromDatabase(w); };
        suggestionsBox.appendChild(div);
      });
      suggestionsBox.style.display = 'block';
    } else {
      suggestionsBox.innerHTML = '<div style="padding:12px 18px; color: var(--text-muted); font-size:0.9rem">Không tìm thấy. Bạn có thể nhập thủ công ở dưới.</div>';
      suggestionsBox.style.display = 'block';
    }
  }

  function selectWordFromDatabase(word) {
    selectedWord = word;

    var searchInput = document.getElementById('customSearchInput');
    var suggestionsBox = document.getElementById('customSearchSuggestions');
    var clearBtn = document.getElementById('customSearchClearBtn');
    if (searchInput) searchInput.value = '';
    if (suggestionsBox) suggestionsBox.style.display = 'none';
    if (clearBtn) clearBtn.style.display = 'none';

    var selectedWordEl = document.getElementById('customSelectedWord');
    var hanziEl = document.getElementById('selectedHanzi');
    var pinyinEl = document.getElementById('selectedPinyin');
    var meaningEl = document.getElementById('selectedMeaning');
    var exampleEl = document.getElementById('selectedExample');
    if (hanziEl) hanziEl.textContent = word.h;
    if (pinyinEl) pinyinEl.textContent = word.p;
    if (meaningEl) meaningEl.textContent = word.m;
    if (exampleEl) exampleEl.textContent = word.ex || word.e || 'Không có ví dụ';
    if (selectedWordEl) selectedWordEl.style.display = 'block';

    var manualDetails = document.getElementById('manualInputDetails');
    if (manualDetails) manualDetails.removeAttribute('open');
  }

  function deselectWord() {
    selectedWord = null;
    var selectedWordEl = document.getElementById('customSelectedWord');
    if (selectedWordEl) selectedWordEl.style.display = 'none';
    var searchInput = document.getElementById('customSearchInput');
    if (searchInput) searchInput.focus();
  }

  function addSelectedWord() {
    if (!selectedWord) return;
    if (currentCustomWords.some(function (w) { return w.h === selectedWord.h; })) {
      if (window.showToast) {
        window.showToast('Từ "' + selectedWord.h + '" đã có trong danh sách!', 'error');
      }
      return;
    }
    currentCustomWords.push({
      h: selectedWord.h,
      p: selectedWord.p,
      m: selectedWord.m,
      ex: selectedWord.ex || selectedWord.e || '',
      exp: selectedWord.exp || '',
      exm: selectedWord.exm || ''
    });
    var added = selectedWord.h;
    deselectWord();
    renderCustomWordsList();
    if (window.showToast) {
      window.showToast('Đã thêm từ "' + added + '"', 'success');
    }
  }

  // ==================== MANUAL WORD ====================

  function addManualWord() {
    var hanzi = (document.getElementById('customHanzi') || {}).value || '';
    var pinyin = (document.getElementById('customPinyin') || {}).value || '';
    var meaning = (document.getElementById('customMeaning') || {}).value || '';
    var example = (document.getElementById('customExample') || {}).value || '';
    var exampleMeaning = (document.getElementById('customExampleMeaning') || {}).value || '';

    hanzi = hanzi.trim();
    pinyin = pinyin.trim();
    meaning = meaning.trim();
    example = example.trim();
    exampleMeaning = exampleMeaning.trim();

    if (!hanzi || !pinyin || !meaning) {
      if (window.showToast) {
        window.showToast('Vui lòng nhập đầy đủ Hán tự, Pinyin và Nghĩa!', 'error');
      }
      return;
    }

    if (currentCustomWords.some(function (w) { return w.h === hanzi; })) {
      if (window.showToast) {
        window.showToast('Từ "' + hanzi + '" đã có trong danh sách!', 'error');
      }
      return;
    }

    var wordObj = { h: hanzi, p: pinyin, m: meaning, ex: example, exm: exampleMeaning };
    if (typeof window.enrichWordWithSentence === 'function') {
      wordObj = window.enrichWordWithSentence(wordObj);
    }
    if (example || exampleMeaning) {
      try {
        var savedSentences = JSON.parse(localStorage.getItem('wq_custom_sentences') || '{}');
        savedSentences[hanzi] = { ex: wordObj.ex, exp: wordObj.exp || '', exm: wordObj.exm };
        localStorage.setItem('wq_custom_sentences', JSON.stringify(savedSentences));
      } catch (e) { }
    }

    currentCustomWords.push(wordObj);
    clearManualForm();
    renderCustomWordsList();
    if (window.showToast) {
      window.showToast('Đã thêm từ "' + hanzi + '"', 'success');
    }
  }

  function clearManualForm() {
      ['customHanzi', 'customPinyin', 'customMeaning', 'customExample', 'customExampleMeaning'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
      });
    }

  // ==================== SAVE DECK ====================

  async function saveCustomDeck() {
        if (currentCustomWords.length === 0) {
          if (window.showToast) {
            window.showToast('Bộ từ đang trống! Hãy thêm từ trước khi lưu.', 'error');
          }
          return;
        }

        var defaultName = 'Bộ từ ' + (customHistory.length + 1);
        var deckName;

        if (window.wqPopup) {
          deckName = await window.wqPopup.prompt('Đặt tên cho bộ từ này:', {
            title: 'Lưu bộ từ',
            icon: '💾',
            placeholder: defaultName,
            defaultValue: defaultName
          });
        } else {
          deckName = prompt('Đặt tên cho bộ từ này:', defaultName);
        }

        if (!deckName) return;
        deckName = deckName.trim();
        if (!deckName) return;

        var newDeck = {
          id: Date.now(),
          name: deckName,
          words: currentCustomWords.slice(),
          createdAt: new Date().toISOString().split('T')[0],
          wordCount: currentCustomWords.length
        };

        customHistory.unshift(newDeck);
        saveCustomHistory();
        renderCustomHistory();

        // Sync lên Cloudflare
        if (window.WeiQuanAPI) {
          window.WeiQuanAPI.createDeck(USER_ID, deckName, currentCustomWords.slice()).then(function (res) {
            if (res && res.success && res.deck_id) {
              newDeck.cloudId = res.deck_id;
              saveCustomHistory();
              if (window.showToast) {
                window.showToast('☁️ Đã lưu "' + deckName + '" lên cloud!', 'success');
              }
            }
          }).catch(function (err) {
            console.warn('⚠️ Lưu cloud thất bại, đã lưu local:', err);
            if (window.showToast) {
              window.showToast('💾 Đã lưu local (cloud lỗi)', 'info');
            }
          });
        }

        if (window.showToast) {
          window.showToast('Đã lưu bộ từ "' + deckName + '" (' + newDeck.wordCount + ' từ)', 'success');
        }
      }

  // ==================== STUDY ====================

  function studyCustomDeck() {
    if (currentCustomWords.length === 0) {
      if (window.showToast) {
        window.showToast('Bộ từ đang trống! Hãy thêm từ trước khi học.', 'error');
      }
      return;
    }
    showStudyModeModal({ name: 'Bộ từ tự tạo', words: currentCustomWords.slice() });
  }

  function showStudyModeModal(deckObj) {
    var modal = document.getElementById('studyModeModal');
    if (!modal) return;

    var subtitle = document.getElementById('studyModeDeckSubtitle');
    var count = deckObj.words ? deckObj.words.length : 0;
    if (subtitle) {
      subtitle.textContent = (deckObj.name || 'Bộ từ tự tạo') + ' • ' + count + ' từ vựng';
    }

    // Reset cuộn lên đỉnh để luôn thấy lựa chọn đầu tiên (Flashcard)
    modal.scrollTop = 0;
    var mc = modal.querySelector('.modal-content');
    if (mc) mc.scrollTop = 0;
    var mb = modal.querySelector('.modal-body');
    if (mb) mb.scrollTop = 0;

    modal.classList.add('active');

    // Replace buttons to remove stale listeners
    var options = modal.querySelectorAll('.study-mode-option');
    options.forEach(function (btn) {
      var newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });

    modal.querySelectorAll('.study-mode-option').forEach(function (btn) {
      btn.onclick = function () {
        var mode = btn.dataset.mode;
        modal.classList.remove('active');
        startStudySession(mode, deckObj);
      };
    });
  }

  function startStudySession(mode, deckObj) {
    var name = deckObj.name || 'Bộ từ tự tạo';
    var words = (deckObj.words || []).slice();

    if (words.length === 0) {
      if (window.showToast) window.showToast('Bộ từ này đang trống!', 'error');
      return;
    }

    if ((mode === 'quiz' || mode === 'sentence' || mode === 'both') && words.length < 2) {
      if (window.showToast) window.showToast('Cần ít nhất 2 từ để học chế độ này!', 'error');
      return;
    }

    // Shuffle before navigating
    shuffle(words);

    var pendingDeck = JSON.stringify({ id: deckObj.id || null, name: name, words: words });
    localStorage.setItem('wq_pending_deck', pendingDeck);
    localStorage.setItem('wq_pending_mode', mode);

    if (mode === 'flashcard' || mode === 'both') {
      window.location.href = '../pages/flash.html';
    } else if (mode === 'quiz') {
      window.location.href = '../pages/quiz.html';
    } else if (mode === 'sentence') {
      window.location.href = '../pages/sentence.html';
    } else if (mode === 'write') {
      window.location.href = '../pages/write.html';
    }
  }

  // ==================== JSON IMPORT ====================

  var _pendingAutoSaveDeckName = null;

  function openImportJsonModal() {
    var modal = document.getElementById('importJsonModal');
    if (!modal) return;
    var fileInput = document.getElementById('jsonFileInput');
    var textInput = document.getElementById('jsonTextInput');
    var deckNameInput = document.getElementById('jsonDeckNameInput');
    var liveStatus = document.getElementById('jsonLiveStatus');
    if (fileInput) fileInput.value = '';
    if (textInput) textInput.value = '';
    if (deckNameInput) deckNameInput.value = '';
    if (liveStatus) {
      liveStatus.style.display = 'none';
      liveStatus.innerHTML = '';
    }
    _pendingAutoSaveDeckName = null;
    modal.classList.add('active');
    setTimeout(function () {
      if (textInput) textInput.focus();
    }, 80);
  }

  function closeImportJsonModal() {
    var modal = document.getElementById('importJsonModal');
    if (modal) modal.classList.remove('active');
  }

  // Làm sạch chuỗi JSON trước khi parse (xử lý markdown ```json, dấu phẩy thừa, BOM, v.v.)
  function sanitizeJsonString(raw) {
    if (!raw || typeof raw !== 'string') return '';
    var s = raw.replace(/^\uFEFF/, '').trim();

    // Bỏ markdown code fence ```json ... ``` hoặc ``` ... ```
    s = s.replace(/^```(?:json|js|javascript)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Nếu người dùng dán kèm văn bản thừa bên ngoài cặp [...] hoặc {...}, trích xuất phần JSON chính
    var firstBracket = s.indexOf('[');
    var firstBrace = s.indexOf('{');
    var startIdx = -1;
    var endChar = '';
    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      endChar = ']';
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      endChar = '}';
    }
    if (startIdx > 0) {
      var lastIdx = s.lastIndexOf(endChar);
      if (lastIdx > startIdx) {
        s = s.slice(startIdx, lastIdx + 1);
      }
    }

    // Xóa dấu phẩy thừa trước ] hoặc } (vd: [{"h":"你好"},])
    s = s.replace(/,\s*([\]}])/g, '$1');

    return s.trim();
  }

  // Tra cứu từ trong kho DATA và WQ_SENTENCE_BANK để tự điền Pinyin / Nghĩa / Câu ví dụ nếu thiếu
  function lookupWordFallback(hanzi) {
    if (!hanzi) return null;
    var key = String(hanzi).trim();
    if (window.WQ_SENTENCE_BANK && window.WQ_SENTENCE_BANK[key]) {
      var sb = window.WQ_SENTENCE_BANK[key];
      if (sb.p || sb.m || sb.ex) return sb;
    }
    if (typeof DATA !== 'undefined' && DATA) {
      var levels = Object.keys(DATA);
      for (var i = 0; i < levels.length; i++) {
        var arr = DATA[levels[i]];
        if (!Array.isArray(arr)) continue;
        for (var j = 0; j < arr.length; j++) {
          if (arr[j] && arr[j].h === key) return arr[j];
        }
      }
    }
    return null;
  }

  function normalizeImportedWord(rawItem) {
    if (!rawItem) return null;

    // Hỗ trợ mảng chuỗi chữ Hán đơn giản: ["你好", "谢谢"]
    if (typeof rawItem === 'string') {
      var hStr = rawItem.trim();
      if (!hStr) return null;
      var fbStr = lookupWordFallback(hStr) || {};
      var objStr = {
        h: hStr,
        p: fbStr.p || '',
        m: fbStr.m || 'Chưa có nghĩa',
        ex: fbStr.ex || fbStr.e || '',
        exp: fbStr.exp || '',
        exm: fbStr.exm || ''
      };
      return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(objStr) : objStr;
    }

    if (typeof rawItem !== 'object') return null;

    var h = String(rawItem.h || rawItem.hanzi || rawItem.word || rawItem.char || rawItem.zh || rawItem.chinese || rawItem.character || '').trim();
    if (!h) return null;

    var fb = lookupWordFallback(h) || {};
    var p = String(rawItem.p || rawItem.pinyin || rawItem.py || rawItem.pronunciation || fb.p || '').trim();
    var m = String(rawItem.m || rawItem.meaning || rawItem.mean || rawItem.vi || rawItem.vn || rawItem.vietnamese || rawItem.translation || fb.m || '').trim();
    var ex = String(rawItem.ex || rawItem.e || rawItem.example || rawItem.sentence || rawItem.s || rawItem.example_zh || fb.ex || fb.e || '').trim();
    var exp = String(rawItem.exp || rawItem.ep || rawItem.example_pinyin || rawItem.sentence_pinyin || fb.exp || '').trim();
    var exm = String(rawItem.exm || rawItem.em || rawItem.example_meaning || rawItem.sentence_meaning || rawItem.example_vi || fb.exm || '').trim();

    if (!m) m = 'Chưa có nghĩa';

    var wordObj = { h: h, p: p, m: m, ex: ex, exp: exp, exm: exm };
    if (Array.isArray(rawItem.tokens) && rawItem.tokens.length) {
      wordObj.tokens = rawItem.tokens;
    } else if (Array.isArray(rawItem.segments) && rawItem.segments.length) {
      wordObj.tokens = rawItem.segments;
    }
    if (rawItem.blank) wordObj.blank = String(rawItem.blank).trim();
    if (Array.isArray(rawItem.options) && rawItem.options.length) {
      wordObj.options = rawItem.options;
    }
    if (Array.isArray(rawItem.examples) && rawItem.examples.length) {
      wordObj.examples = rawItem.examples;
    } else if (Array.isArray(rawItem.sentences) && rawItem.sentences.length) {
      wordObj.examples = rawItem.sentences;
    }
    return typeof window.enrichWordWithSentence === 'function' ? window.enrichWordWithSentence(wordObj) : wordObj;
  }

  function parseImportedJson(jsonString) {
    try {
      var cleaned = sanitizeJsonString(jsonString);
      if (!cleaned) {
        return { success: false, error: 'Nội dung JSON đang trống' };
      }

      var parsed = JSON.parse(cleaned);
      var rawWords = [];
      var suggestedDeckName = '';

      if (Array.isArray(parsed)) {
        parsed.forEach(function (item) {
          var nw = normalizeImportedWord(item);
          if (nw) rawWords.push(nw);
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Trường hợp 1: Object 1 từ duy nhất {"h": "你好", "p": "nǐ hǎo", "m": "Xin chào"}
        if (parsed.h || parsed.hanzi || parsed.word || parsed.zh) {
          var single = normalizeImportedWord(parsed);
          if (single) rawWords.push(single);
        } else {
          // Trường hợp 2: Object có {"name": "Bài 11", "words": [...]} hoặc {"Bài 11": [...]}
          if (typeof parsed.name === 'string' || typeof parsed.deck_name === 'string' || typeof parsed.title === 'string') {
            suggestedDeckName = (parsed.name || parsed.deck_name || parsed.title || '').trim();
          }
          var arrayKeys = Object.keys(parsed).filter(function (k) { return Array.isArray(parsed[k]); });
          if (!suggestedDeckName && arrayKeys.length === 1 && arrayKeys[0] !== 'words' && arrayKeys[0] !== 'data' && arrayKeys[0] !== 'items') {
            suggestedDeckName = arrayKeys[0];
          }
          arrayKeys.forEach(function (key) {
            parsed[key].forEach(function (item) {
              var nw = normalizeImportedWord(item);
              if (nw) rawWords.push(nw);
            });
          });
        }
      }

      // Gộp các object cùng chữ Hán "h" thành 1 từ với mảng "examples" chứa tất cả các câu ví dụ
      var words = typeof window.deduplicateWords === 'function' ? window.deduplicateWords(rawWords) : rawWords;

      var withExCount = words.filter(function (w) { return Boolean(w.ex); }).length;
      var totalSentencesCount = words.reduce(function (sum, w) {
        if (Array.isArray(w.examples) && w.examples.length > 0) return sum + w.examples.length;
        return sum + (w.ex ? 1 : 0);
      }, 0);

      return {
        success: true,
        words: words,
        count: words.length,
        withExCount: withExCount,
        totalSentencesCount: totalSentencesCount,
        suggestedDeckName: suggestedDeckName
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function updateJsonLiveStatus() {
    var textInput = document.getElementById('jsonTextInput');
    var liveStatus = document.getElementById('jsonLiveStatus');
    var deckNameInput = document.getElementById('jsonDeckNameInput');
    if (!textInput || !liveStatus) return;

    var raw = textInput.value.trim();
    if (!raw) {
      liveStatus.style.display = 'none';
      liveStatus.innerHTML = '';
      return;
    }

    var res = parseImportedJson(raw);
    liveStatus.style.display = 'block';

    if (!res.success) {
      liveStatus.style.background = 'rgba(239, 68, 68, 0.08)';
      liveStatus.style.borderColor = 'rgba(239, 68, 68, 0.35)';
      liveStatus.innerHTML =
        '<div style="color: var(--neon-red); font-weight: 700; margin-bottom: 4px;">❌ Lỗi cú pháp JSON: ' + res.error + '</div>' +
        '<div style="color: var(--text-secondary); font-size: 0.8rem;">💡 Mẹo: Bấm nút <b>"🪄 Tự sửa &amp; Format"</b> ở góc phải trên để tự động làm sạch lỗi dấu phẩy hoặc markdown.</div>';
      return;
    }

    if (res.count === 0) {
      liveStatus.style.background = 'rgba(245, 158, 11, 0.08)';
      liveStatus.style.borderColor = 'rgba(245, 158, 11, 0.35)';
      liveStatus.innerHTML =
        '<div style="color: #d97706; font-weight: 700;">⚠️ JSON hợp lệ nhưng chưa tìm thấy từ vựng nào (cần có trường <code>"h"</code> hoặc <code>"hanzi"</code>).</div>';
      return;
    }

    if (res.suggestedDeckName && deckNameInput && !deckNameInput.value.trim()) {
      deckNameInput.value = res.suggestedDeckName;
    }

    var previewChips = res.words.slice(0, 8).map(function (w) {
      var sentBadge = (Array.isArray(w.examples) && w.examples.length > 1)
        ? ' <span style="font-size:0.72rem; color:var(--accent-purple); font-weight:700;">🎲' + w.examples.length + ' câu</span>'
        : '';
      return '<span style="display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:8px; background:rgba(139,92,246,0.1); border:1px solid var(--glass-border); font-size:0.8rem; color:var(--text-primary);">' +
        '<b>' + w.h + '</b>' +
        (w.p ? ' <span style="color:var(--neon-cyan);">(' + w.p + ')</span>' : '') +
        sentBadge +
        '</span>';
    }).join(' ');
    if (res.count > 8) {
      previewChips += ' <span style="font-size:0.78rem; color:var(--text-muted);">+' + (res.count - 8) + ' từ khác</span>';
    }

    var multiSentNote = res.totalSentencesCount > res.withExCount
      ? ' · Tổng <b>' + res.totalSentencesCount + ' câu ví dụ</b> (tự động random câu khi học 🎲)'
      : ' (có <b>' + res.withExCount + '/' + res.count + '</b> câu ví dụ ghép câu)';

    liveStatus.style.background = 'rgba(16, 185, 129, 0.08)';
    liveStatus.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    liveStatus.innerHTML =
      '<div style="color: var(--neon-green); font-weight: 700; margin-bottom: 6px;">' +
      '✅ JSON hợp lệ: Nhận diện <b>' + res.count + ' từ vựng</b>' + multiSentNote +
      '</div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center;">' + previewChips + '</div>';
  }

  async function saveDeckDirect(deckName, wordsToSave) {
    if (!wordsToSave || wordsToSave.length === 0) return;
    persistWordsSentences(wordsToSave);

    var finalName = (deckName || '').trim();
    if (!finalName) {
      var defaultName = 'Bộ từ ' + (customHistory.length + 1);
      if (window.wqPopup) {
        finalName = await window.wqPopup.prompt('Đặt tên cho bộ từ này:', {
          title: 'Lưu bộ từ JSON',
          icon: '💾',
          placeholder: defaultName,
          defaultValue: defaultName
        });
      } else {
        finalName = prompt('Đặt tên cho bộ từ này:', defaultName);
      }
    }
    if (!finalName || !finalName.trim()) return;
    finalName = finalName.trim();

    var newDeck = {
      id: Date.now(),
      name: finalName,
      words: wordsToSave.slice(),
      createdAt: new Date().toISOString().split('T')[0],
      wordCount: wordsToSave.length
    };

    customHistory.unshift(newDeck);
    saveCustomHistory();
    renderCustomHistory();

    if (window.WeiQuanAPI) {
      window.WeiQuanAPI.createDeck(USER_ID, finalName, wordsToSave.slice()).then(function (res) {
        if (res && res.success && res.deck_id) {
          newDeck.cloudId = res.deck_id;
          saveCustomHistory();
          if (window.showToast) {
            window.showToast('☁️ Đã lưu "' + finalName + '" (' + newDeck.wordCount + ' từ) lên Cloud!', 'success');
          }
        }
      }).catch(function (err) {
        console.warn('⚠️ Lưu cloud thất bại, đã lưu local:', err);
      });
    }

    if (window.showToast) {
      window.showToast('✅ Đã nhập & lưu bộ từ "' + finalName + '" (' + newDeck.wordCount + ' từ)!', 'success');
    }
  }

  function processJsonImport(jsonString, autoSaveNow) {
    var result = parseImportedJson(jsonString);

    if (!result.success) {
      updateJsonLiveStatus();
      if (window.showToast) {
        window.showToast('❌ JSON không hợp lệ: ' + result.error, 'error');
      }
      return;
    }

    if (result.count === 0) {
      updateJsonLiveStatus();
      if (window.showToast) {
        window.showToast('⚠️ Không tìm thấy từ vựng hợp lệ trong JSON!', 'error');
      }
      return;
    }

    // Lưu ngay các câu ví dụ (ex, exp, exm) vào localStorage + WQ_SENTENCE_BANK
    persistWordsSentences(result.words);

    var deckNameInput = document.getElementById('jsonDeckNameInput');
    var customName = (deckNameInput && deckNameInput.value.trim()) || result.suggestedDeckName || '';

    // Nếu người dùng bấm "💾 Nhập & Lưu bộ từ ngay"
    if (autoSaveNow) {
      currentCustomWords = result.words.slice();
      closeImportJsonModal();
      renderCustomWordsList();
      saveDeckDirect(customName, currentCustomWords);
      return;
    }

    var newWords = [];
    var duplicateWords = [];

    result.words.forEach(function (word) {
      var existingIndex = currentCustomWords.findIndex(function (w) { return w.h === word.h; });
      if (existingIndex === -1) {
        newWords.push(word);
      } else {
        duplicateWords.push({ word: word, existing: currentCustomWords[existingIndex], index: existingIndex });
      }
    });

    if (duplicateWords.length > 0) {
      showDuplicateConfirmDialog(newWords, duplicateWords);
    } else {
      currentCustomWords.push.apply(currentCustomWords, newWords);
      closeImportJsonModal();
      renderCustomWordsList();
      if (window.showToast) {
        window.showToast('✅ Đã thêm ' + newWords.length + ' từ vào danh sách đang soạn!', 'success');
      }
    }
  }

  function importJsonWords(autoSaveNow) {
    var fileInput = document.getElementById('jsonFileInput');
    var textInput = document.getElementById('jsonTextInput');

    if (textInput && textInput.value.trim()) {
      processJsonImport(textInput.value.trim(), Boolean(autoSaveNow));
    } else if (fileInput && fileInput.files && fileInput.files.length > 0) {
      var file = fileInput.files[0];
      var reader = new FileReader();
      reader.onload = function (e) {
        if (textInput) textInput.value = e.target.result;
        processJsonImport(e.target.result, Boolean(autoSaveNow));
      };
      reader.onerror = function () {
        if (window.showToast) window.showToast('❌ Lỗi đọc file!', 'error');
      };
      reader.readAsText(file);
    } else {
      if (window.showToast) {
        window.showToast('⚠️ Vui lòng chọn file JSON hoặc dán nội dung JSON!', 'error');
      }
    }
  }

  // ==================== DUPLICATE HANDLING ====================

  function showDuplicateConfirmDialog(newWords, duplicateWords) {
        var modal = document.getElementById('duplicateConfirmModal');
        if (!modal) return;

        window._importData = { newWords: newWords, duplicateWords: duplicateWords };

        var summary = document.getElementById('duplicateSummary');
        if (summary) {
          summary.innerHTML =
            '<div style="display: flex; justify-content: space-around; text-align: center;">' +
            '<div>' +
            '<div style="font-size: 2rem; font-weight: 800; color: var(--neon-green);">' + newWords.length + '</div>' +
            '<div style="font-size: 0.85rem; color: var(--text-secondary);">Từ mới</div>' +
            '</div>' +
            '<div>' +
            '<div style="font-size: 2rem; font-weight: 800; color: #F59E0B;">' + duplicateWords.length + '</div>' +
            '<div style="font-size: 0.85rem; color: var(--text-secondary);">Từ trùng</div>' +
            '</div>' +
            '</div>';
        }

        var newWordsCount = document.getElementById('newWordsCount');
        var duplicateWordsCount = document.getElementById('duplicateWordsCount');
        if (newWordsCount) newWordsCount.textContent = newWords.length;
        if (duplicateWordsCount) duplicateWordsCount.textContent = duplicateWords.length;

        var list = document.getElementById('duplicateList');
        if (list) {
          list.innerHTML = '';
          var shown = duplicateWords.slice(0, 10);
          shown.forEach(function (d) {
            var item = document.createElement('div');
            item.style.cssText = 'padding: 10px; margin-bottom: 8px; background: rgba(139, 92, 246, 0.04); border-radius: 10px; border: 1px solid rgba(245, 158, 11, 0.25);';
            item.innerHTML =
              '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
              '<span style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">' + d.word.h + '</span>' +
              '<span style="font-size: 0.85rem; color: var(--neon-cyan);">' + d.word.p + '</span>' +
              '</div>' +
              '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.85rem;">' +
              '<div>' +
              '<div style="color: var(--text-muted); font-size: 0.75rem;">Hiện tại:</div>' +
              '<div style="color: var(--text-secondary);">' + d.existing.m + '</div>' +
              '</div>' +
              '<div>' +
              '<div style="color: var(--text-muted); font-size: 0.75rem;">Mới:</div>' +
              '<div style="color: #F97316;">' + d.word.m + '</div>' +
              '</div>' +
              '</div>';
            list.appendChild(item);
          });

          if (duplicateWords.length > 10) {
            var more = document.createElement('div');
            more.style.cssText = 'padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem;';
            more.textContent = '... và ' + (duplicateWords.length - 10) + ' từ khác';
            list.appendChild(more);
          }
        }

        closeImportJsonModal();
        modal.classList.add('active');
      }

  function handleSkipDuplicates() {
        var data = window._importData || {};
        var newWords = data.newWords;
        if (!newWords) return;

        currentCustomWords.push.apply(currentCustomWords, newWords);
        closeDuplicateModal();
        renderCustomWordsList();
        if (window.showToast) {
          window.showToast('✅ Đã thêm ' + newWords.length + ' từ mới!', 'success');
        }
        delete window._importData;
      }

  function handleOverwriteDuplicates() {
        var data = window._importData || {};
        var newWords = data.newWords;
        var duplicateWords = data.duplicateWords;
        if (!newWords || !duplicateWords) return;

        currentCustomWords.push.apply(currentCustomWords, newWords);
        duplicateWords.forEach(function (d) {
          var mergedWord = typeof window.mergeWordExamples === 'function'
            ? window.mergeWordExamples(d.existing, d.word)
            : d.word;
          if (d.word.p) mergedWord.p = d.word.p;
          if (d.word.m && d.word.m !== 'Chưa có nghĩa') mergedWord.m = d.word.m;
          currentCustomWords[d.index] = mergedWord;
        });

        persistWordsSentences(currentCustomWords);
        closeDuplicateModal();
        renderCustomWordsList();
        if (window.showToast) {
          window.showToast('✅ Đã thêm ' + newWords.length + ' từ mới + gộp câu ví dụ cho ' + duplicateWords.length + ' từ trùng!', 'success');
        }
        delete window._importData;
      }

  function closeDuplicateModal() {
        var modal = document.getElementById('duplicateConfirmModal');
        if (modal) modal.classList.remove('active');
      }

  // ==================== EVENT BINDING ====================

  function initCustomDeckEvents() {
        var searchInput = document.getElementById('customSearchInput');
        var searchClearBtn = document.getElementById('customSearchClearBtn');
        var suggestionsBox = document.getElementById('customSearchSuggestions');
        var deselectBtn = document.getElementById('deselectWordBtn');
        var addSelectedBtn = document.getElementById('addSelectedWordBtn');
        var addManualBtn = document.getElementById('addManualWordBtn');
        var saveBtn = document.getElementById('saveCustomDeckBtn');
        var studyBtn = document.getElementById('studyCustomDeckBtn');
        var importJsonBtn = document.getElementById('importJsonBtn');
        var studyModeModal = document.getElementById('studyModeModal');
        var closeStudyModeBtn = document.getElementById('closeStudyModeBtn');

        // Import JSON modal
        var closeImportBtn = document.getElementById('closeImportJsonBtn');
        var cancelImportBtn = document.getElementById('cancelImportJsonBtn');
        var confirmImportBtn = document.getElementById('confirmImportJsonBtn');
        var importAndSaveBtn = document.getElementById('importAndSaveDeckBtn');
        var importModal = document.getElementById('importJsonModal');
        var jsonFileInput = document.getElementById('jsonFileInput');
        var jsonTextInput = document.getElementById('jsonTextInput');
        var jsonDeckNameInput = document.getElementById('jsonDeckNameInput');
        var insertSampleBtn = document.getElementById('insertSampleJsonBtn');
        var formatJsonBtn = document.getElementById('formatJsonBtn');
        var copyAiPromptBtn = document.getElementById('copyAiPromptBtn');
        var clearJsonBtn = document.getElementById('clearJsonBtn');

        // Duplicate modal
        var closeDupBtn = document.getElementById('closeDuplicateModalBtn');
        var cancelDupBtn = document.getElementById('cancelDuplicateBtn');
        var skipBtn = document.getElementById('skipDuplicatesBtn');
        var overwriteBtn = document.getElementById('overwriteDuplicatesBtn');
        var dupModal = document.getElementById('duplicateConfirmModal');

        // Search
        if (searchInput) {
          searchInput.addEventListener('input', function (e) {
            renderCustomSearchSuggestions(e.target.value);
          });
        }

        if (searchClearBtn) {
          searchClearBtn.onclick = function () {
            if (searchInput) searchInput.value = '';
            if (suggestionsBox) suggestionsBox.style.display = 'none';
            searchClearBtn.style.display = 'none';
            if (searchInput) searchInput.focus();
          };
        }

        document.addEventListener('click', function (e) {
          if (suggestionsBox &&
            !e.target.closest('#customSearchInput') &&
            !e.target.closest('#customSearchSuggestions')) {
            suggestionsBox.style.display = 'none';
          }
        });

        if (deselectBtn) deselectBtn.onclick = deselectWord;
        if (addSelectedBtn) addSelectedBtn.onclick = addSelectedWord;
        if (addManualBtn) addManualBtn.onclick = addManualWord;
        if (saveBtn) saveBtn.onclick = saveCustomDeck;
        if (studyBtn) studyBtn.onclick = studyCustomDeck;
        if (importJsonBtn) importJsonBtn.onclick = openImportJsonModal;

        if (closeImportBtn) closeImportBtn.onclick = closeImportJsonModal;
        if (cancelImportBtn) cancelImportBtn.onclick = closeImportJsonModal;
        if (confirmImportBtn) {
          confirmImportBtn.onclick = function () { importJsonWords(false); };
        }
        if (importAndSaveBtn) {
          importAndSaveBtn.onclick = function () { importJsonWords(true); };
        }

        if (jsonTextInput) {
          jsonTextInput.addEventListener('input', updateJsonLiveStatus);
        }

        if (jsonFileInput) {
          jsonFileInput.addEventListener('change', function () {
            if (!jsonFileInput.files || jsonFileInput.files.length === 0) return;
            var file = jsonFileInput.files[0];
            if (jsonDeckNameInput && !jsonDeckNameInput.value.trim() && file.name) {
              jsonDeckNameInput.value = file.name.replace(/\.(json|txt)$/i, '');
            }
            var reader = new FileReader();
            reader.onload = function (e) {
              if (jsonTextInput) {
                jsonTextInput.value = e.target.result || '';
                updateJsonLiveStatus();
              }
            };
            reader.onerror = function () {
              if (window.showToast) window.showToast('❌ Không thể đọc file JSON!', 'error');
            };
            reader.readAsText(file);
          });
        }

        if (insertSampleBtn && jsonTextInput) {
          insertSampleBtn.onclick = function () {
            var sample = [
              {
                h: '老师',
                p: 'lǎoshī',
                m: 'Giáo viên, thầy/cô giáo',
                examples: [
                  {
                    ex: '王老师教我们汉语。',
                    exp: 'Wáng lǎoshī jiāo wǒmen Hànyǔ.',
                    exm: 'Thầy Vương dạy chúng tôi tiếng Trung.',
                    tokens: [
                      { h: '王老师', p: 'Wáng lǎoshī', m: 'Thầy Vương' },
                      { h: '教', p: 'jiāo', m: 'dạy' },
                      { h: '我们', p: 'wǒmen', m: 'chúng tôi' },
                      { h: '汉语', p: 'Hànyǔ', m: 'tiếng Trung' }
                    ],
                    blank: '老师',
                    options: ['老师', '学生', '朋友', '医生']
                  },
                  {
                    ex: '她是我的汉语老师。',
                    exp: 'Tā shì wǒ de Hànyǔ lǎoshī.',
                    exm: 'Cô ấy là giáo viên tiếng Trung của tôi.',
                    tokens: [
                      { h: '她', p: 'tā', m: 'cô ấy' },
                      { h: '是', p: 'shì', m: 'là' },
                      { h: '我的', p: 'wǒ de', m: 'của tôi' },
                      { h: '汉语', p: 'Hànyǔ', m: 'tiếng Trung' },
                      { h: '老师', p: 'lǎoshī', m: 'giáo viên' }
                    ],
                    blank: '老师',
                    options: ['老师', '同学', '经理', '大夫']
                  }
                ]
              },
              {
                h: '你好',
                p: 'nǐ hǎo',
                m: 'Xin chào',
                ex: '你好，我是越南学生。',
                exp: 'Nǐ hǎo, wǒ shì Yuènán xuéshēng.',
                exm: 'Xin chào, tôi là lưu học sinh Việt Nam.',
                tokens: [
                  { h: '你好', p: 'nǐ hǎo', m: 'xin chào' },
                  { h: '我是', p: 'wǒ shì', m: 'tôi là' },
                  { h: '越南', p: 'Yuènán', m: 'Việt Nam' },
                  { h: '学生', p: 'xuéshēng', m: 'học sinh' }
                ],
                blank: '你好',
                options: ['你好', '谢谢', '再见', '老师']
              }
            ];
            jsonTextInput.value = JSON.stringify(sample, null, 2);
            updateJsonLiveStatus();
            if (window.showToast) window.showToast('📋 Đã chèn mẫu JSON (gồm cả từ có nhiều câu ví dụ random)!', 'info');
          };
        }

        if (formatJsonBtn && jsonTextInput) {
          formatJsonBtn.onclick = function () {
            var raw = jsonTextInput.value.trim();
            if (!raw) {
              if (window.showToast) window.showToast('⚠️ Ô nhập JSON đang trống!', 'warning');
              return;
            }
            var res = parseImportedJson(raw);
            if (res.success && res.words.length > 0) {
              jsonTextInput.value = JSON.stringify(res.words, null, 2);
              updateJsonLiveStatus();
              if (window.showToast) window.showToast('🪄 Đã chuẩn hóa & căn lề ' + res.words.length + ' từ!', 'success');
            } else {
              updateJsonLiveStatus();
              if (window.showToast) window.showToast('❌ Không thể tự sửa: ' + (res.error || 'Dữ liệu trống'), 'error');
            }
          };
        }

        if (copyAiPromptBtn) {
          copyAiPromptBtn.onclick = function () {
            var promptText =
              'Hãy chuyển danh sách từ vựng tiếng Trung sau đây thành định dạng JSON chuẩn (chỉ trả về JSON thuần túy) để nhập vào web học tiếng Trung (gồm Flashcard, Trắc nghiệm, Sắp xếp câu, Điền từ và Tooltip dịch từng từ).\n' +
              'Mỗi từ gồm các trường:\n' +
              '- "h": Chữ Hán (bắt buộc)\n' +
              '- "p": Pinyin có dấu thanh điệu\n' +
              '- "m": Nghĩa tiếng Việt ngắn gọn, rõ ràng\n' +
              '- "examples": Mảng từ 2 đến 3 câu ví dụ khác nhau chứa từ đó (để mỗi lần gặp lại từ trong lượt học, web tự động random câu khác nhau). Mỗi câu trong mảng "examples" gồm:\n' +
              '   + "ex": Câu ví dụ tiếng Trung (khoảng 5-10 chữ, có dấu chấm câu)\n' +
              '   + "exp": Pinyin của cả câu ví dụ\n' +
              '   + "exm": Nghĩa tiếng Việt của cả câu ví dụ\n' +
              '   + "tokens": Mảng tách câu "ex" thành 3-6 mảnh từ để người học xếp câu, mỗi mảnh gồm {"h": "mảnh chữ Hán", "p": "pinyin mảnh đó", "m": "nghĩa tiếng Việt mảnh đó"}\n' +
              '   + "blank": Từ cần đục lỗ trong câu "ex" cho bài Điền từ\n' +
              '   + "options": Mảng 4 phương án chữ Hán cho bài Điền từ (1 đáp án đúng + 3 từ gây nhiễu)\n\n' +
              'Ví dụ kết quả:\n' +
              '{\n' +
              '  "name": "Bài 11",\n' +
              '  "words": [\n' +
              '    {\n' +
              '      "h": "老师",\n' +
              '      "p": "lǎoshī",\n' +
              '      "m": "Giáo viên",\n' +
              '      "examples": [\n' +
              '        {\n' +
              '          "ex": "王老师教我们汉语。",\n' +
              '          "exp": "Wáng lǎoshī jiāo wǒmen Hànyǔ.",\n' +
              '          "exm": "Thầy Vương dạy chúng tôi tiếng Trung.",\n' +
              '          "tokens": [\n' +
              '            { "h": "王老师", "p": "Wáng lǎoshī", "m": "Thầy Vương" },\n' +
              '            { "h": "教", "p": "jiāo", "m": "dạy" },\n' +
              '            { "h": "我们", "p": "wǒmen", "m": "chúng tôi" },\n' +
              '            { "h": "汉语", "p": "Hànyǔ", "m": "tiếng Trung" }\n' +
              '          ],\n' +
              '          "blank": "老师",\n' +
              '          "options": ["老师", "学生", "朋友", "医生"]\n' +
              '        },\n' +
              '        {\n' +
              '          "ex": "她是我的汉语老师。",\n' +
              '          "exp": "Tā shì wǒ de Hànyǔ lǎoshī.",\n' +
              '          "exm": "Cô ấy là giáo viên tiếng Trung của tôi.",\n' +
              '          "tokens": [\n' +
              '            { "h": "她", "p": "tā", "m": "cô ấy" },\n' +
              '            { "h": "是", "p": "shì", "m": "là" },\n' +
              '            { "h": "我的", "p": "wǒ de", "m": "của tôi" },\n' +
              '            { "h": "汉语", "p": "Hànyǔ", "m": "tiếng Trung" },\n' +
              '            { "h": "老师", "p": "lǎoshī", "m": "giáo viên" }\n' +
              '          ],\n' +
              '          "blank": "老师",\n' +
              '          "options": ["老师", "同学", "经理", "大夫"]\n' +
              '        }\n' +
              '      ]\n' +
              '    }\n' +
              '  ]\n' +
              '}\n\n' +
              'Danh sách từ vựng cần tạo:\n';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(promptText).then(function () {
                if (window.showToast) window.showToast('🤖 Đã copy Prompt AI! Hãy dán vào ChatGPT/Gemini kèm danh sách từ.', 'success');
              }).catch(function () {
                if (jsonTextInput) jsonTextInput.value = promptText;
              });
            } else if (jsonTextInput) {
              jsonTextInput.value = promptText;
              if (window.showToast) window.showToast('🤖 Đã điền Prompt AI vào ô!', 'info');
            }
          };
        }

        if (clearJsonBtn) {
          clearJsonBtn.onclick = function () {
            if (jsonFileInput) jsonFileInput.value = '';
            if (jsonTextInput) jsonTextInput.value = '';
            if (jsonDeckNameInput) jsonDeckNameInput.value = '';
            updateJsonLiveStatus();
          };
        }

        if (closeDupBtn) {
          closeDupBtn.onclick = function () {
            closeDuplicateModal();
            delete window._importData;
          };
        }

        if (cancelDupBtn) {
          cancelDupBtn.onclick = function () {
            closeDuplicateModal();
            delete window._importData;
            if (window.showToast) window.showToast('❌ Đã hủy import', 'info');
          };
        }

        if (skipBtn) skipBtn.onclick = handleSkipDuplicates;
        if (overwriteBtn) overwriteBtn.onclick = handleOverwriteDuplicates;

        if (closeStudyModeBtn && studyModeModal) {
          closeStudyModeBtn.onclick = function () {
            studyModeModal.classList.remove('active');
          };
        }

        if (studyModeModal) {
          window.addEventListener('click', function (e) {
            if (e.target === studyModeModal) {
              studyModeModal.classList.remove('active');
            }
          });
        }

        if (importModal) {
          window.addEventListener('click', function (e) {
            if (e.target === importModal) closeImportJsonModal();
          });
        }

        if (dupModal) {
          window.addEventListener('click', function (e) {
            if (e.target === dupModal) {
              closeDuplicateModal();
              delete window._importData;
            }
          });
        }
      }

  // ==================== INIT ====================

  document.addEventListener('DOMContentLoaded', function () {
        initCustomDeckEvents();
        loadCustomHistory();
        renderCustomHistory();
        renderCustomWordsList();
      });

  }) ();
