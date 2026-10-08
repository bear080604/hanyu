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

  function loadCustomHistory() {
    // Load từ localStorage trước để hiển thị nhanh
    customHistory = JSON.parse(localStorage.getItem('wq_custom_decks')) || [];
    renderCustomHistory();

    // Sau đó sync từ Cloudflare API
    if (window.WeiQuanAPI) {
      window.WeiQuanAPI.getDecks(USER_ID).then(function (res) {
        if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
          // Merge: ưu tiên cloud, bổ sung local nếu chưa có trên cloud
          var cloudDecks = res.data.map(function (d) {
            return {
              id: d.id,
              cloudId: d.id,
              name: d.name,
              words: [], // words được load lazy khi cần
              wordCount: d.word_count || 0,
              createdAt: (d.created_at || '').split('T')[0] || new Date().toISOString().split('T')[0]
            };
          });
          customHistory = cloudDecks;
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
            '📚 ' + deckObj.name +
            '<span class="custom-deck-badge">' + (deckObj.wordCount || (deckObj.words ? deckObj.words.length : 0)) + ' từ</span>' +
          '</div>' +
          '<div class="custom-deck-meta">' +
            '<span>📅 ' + deckObj.createdAt + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="custom-deck-actions">' +
          '<button class="btn" style="padding: 8px 16px; border-radius: 12px; font-size: 0.85rem;" data-action="load">📥 Tải lại</button>' +
          '<button class="btn" style="padding: 8px 16px; border-radius: 12px; font-size: 0.85rem; background: var(--accent-gradient); color: #fff; border: none;" data-action="study">🎯 Học</button>' +
          '<button class="custom-word-btn delete" style="width: 36px; height: 36px;" data-action="delete" aria-label="Xóa bộ từ">' +
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
          currentCustomWords = (deckObj.words || []).slice();
          renderCustomWordsList();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          if (window.showToast) window.showToast('Đã tải "' + deckObj.name + '" (' + currentCustomWords.length + ' từ)', 'success');
        }
      };

      item.querySelector('[data-action="study"]').onclick = function (e) {
        e.stopPropagation();
        // Nếu là cloud deck chưa có words, fetch trước
        if (deckObj.cloudId && (!deckObj.words || deckObj.words.length === 0)) {
          if (window.WeiQuanAPI) {
            window.WeiQuanAPI.getDeckById(deckObj.cloudId).then(function (res) {
              if (res && res.success && res.data && res.data.words) {
                deckObj.words = res.data.words;
                showStudyModeModal(deckObj);
              }
            }).catch(function () {
              if (window.showToast) window.showToast('❌ Không thể tải từ cloud!', 'error');
            });
          }
        } else {
          showStudyModeModal(deckObj);
        }
      };

      item.querySelector('[data-action="delete"]').onclick = function (e) {
        e.stopPropagation();
        var confirmMsg = 'Bạn có chắc muốn xóa bộ từ "' + deckObj.name + '"?';
        var doDelete = function () {
          customHistory.splice(index, 1);
          saveCustomHistory();
          renderCustomHistory();
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
      var item = document.createElement('div');
      item.className = 'custom-word-item';
      item.innerHTML =
        '<div class="custom-word-info">' +
          '<div class="custom-word-main">' +
            '<span class="custom-word-hanzi">' + word.h + '</span>' +
            '<span class="custom-word-pinyin">' + word.p + '</span>' +
          '</div>' +
          '<span class="custom-word-meaning">' + word.m + '</span>' +
        '</div>' +
        '<div class="custom-word-actions">' +
          '<button class="custom-word-btn speak" aria-label="Speak" data-index="' + index + '">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>' +
          '</button>' +
          '<button class="custom-word-btn delete" aria-label="Delete" data-index="' + index + '">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>' +
          '</button>' +
        '</div>';

      item.querySelector('.speak').onclick = function (e) {
        e.stopPropagation();
        if (typeof speak === 'function') speak(word.h);
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
      ex: selectedWord.ex || selectedWord.e || ''
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

    hanzi = hanzi.trim();
    pinyin = pinyin.trim();
    meaning = meaning.trim();
    example = example.trim();

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

    currentCustomWords.push({ h: hanzi, p: pinyin, m: meaning, ex: example });
    clearManualForm();
    renderCustomWordsList();
    if (window.showToast) {
      window.showToast('Đã thêm từ "' + hanzi + '"', 'success');
    }
  }

  function clearManualForm() {
    ['customHanzi', 'customPinyin', 'customMeaning', 'customExample'].forEach(function (id) {
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
        window.showToast('Bộ từ đang trống! Hãy thêm từ trước.', 'error');
      }
      return;
    }
    showStudyModeModal({ name: 'Bộ từ tự tạo', words: currentCustomWords.slice() });
  }

  function showStudyModeModal(deckObj) {
    var modal = document.getElementById('studyModeModal');
    if (!modal) return;

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

    // Shuffle before navigating
    shuffle(words);

    var pendingDeck = JSON.stringify({ name: name, words: words });

    if (mode === 'flashcard') {
      localStorage.setItem('wq_pending_deck', pendingDeck);
      localStorage.setItem('wq_pending_mode', 'flashcard');
      window.location.href = '../pages/flash.html';
    } else if (mode === 'quiz') {
      localStorage.setItem('wq_pending_deck', pendingDeck);
      localStorage.setItem('wq_pending_mode', 'quiz');
      window.location.href = '../pages/quiz.html';
    } else if (mode === 'both') {
      localStorage.setItem('wq_pending_deck', pendingDeck);
      localStorage.setItem('wq_pending_mode', 'both');
      window.location.href = '../pages/flash.html';
    }
  }

  // ==================== JSON IMPORT ====================

  function openImportJsonModal() {
    var modal = document.getElementById('importJsonModal');
    if (!modal) return;
    var fileInput = document.getElementById('jsonFileInput');
    var textInput = document.getElementById('jsonTextInput');
    if (fileInput) fileInput.value = '';
    if (textInput) textInput.value = '';
    modal.classList.add('active');
  }

  function closeImportJsonModal() {
    var modal = document.getElementById('importJsonModal');
    if (modal) modal.classList.remove('active');
  }

  function parseImportedJson(jsonString) {
    try {
      var parsed = JSON.parse(jsonString);
      var words = [];

      if (Array.isArray(parsed)) {
        words = parsed.filter(function (w) { return w.h && w.p && w.m; }).map(function (w) {
          return { h: w.h, p: w.p, m: w.m, ex: w.e || w.ex || '' };
        });
      } else if (typeof parsed === 'object' && parsed !== null) {
        Object.keys(parsed).forEach(function (key) {
          if (Array.isArray(parsed[key])) {
            parsed[key].forEach(function (w) {
              if (w.h && w.p && w.m) {
                words.push({ h: w.h, p: w.p, m: w.m, ex: w.e || w.ex || '' });
              }
            });
          }
        });
      }

      return { success: true, words: words, count: words.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  function processJsonImport(jsonString) {
    var result = parseImportedJson(jsonString);

    if (!result.success) {
      if (window.showToast) {
        window.showToast('❌ JSON không hợp lệ: ' + result.error, 'error');
      }
      return;
    }

    if (result.count === 0) {
      if (window.showToast) {
        window.showToast('⚠️ Không tìm thấy từ vựng hợp lệ trong JSON!', 'error');
      }
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
        window.showToast('✅ Đã thêm ' + newWords.length + ' từ mới!', 'success');
      }
    }
  }

  function importJsonWords() {
    var fileInput = document.getElementById('jsonFileInput');
    var textInput = document.getElementById('jsonTextInput');

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      var file = fileInput.files[0];
      var reader = new FileReader();
      reader.onload = function (e) { processJsonImport(e.target.result); };
      reader.onerror = function () {
        if (window.showToast) window.showToast('❌ Lỗi đọc file!', 'error');
      };
      reader.readAsText(file);
    } else if (textInput && textInput.value.trim()) {
      processJsonImport(textInput.value.trim());
    } else {
      if (window.showToast) {
        window.showToast('⚠️ Vui lòng tải file hoặc dán JSON!', 'error');
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
        item.style.cssText = 'padding: 10px; margin-bottom: 8px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,193,7,0.2);';
        item.innerHTML =
          '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">' +
            '<span style="font-size: 1.1rem; font-weight: 700; color: #fff;">' + d.word.h + '</span>' +
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
      currentCustomWords[d.index] = d.word;
    });

    closeDuplicateModal();
    renderCustomWordsList();
    if (window.showToast) {
      window.showToast('✅ Đã thêm ' + newWords.length + ' từ mới + ghi đè ' + duplicateWords.length + ' từ!', 'success');
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
    var importModal = document.getElementById('importJsonModal');

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
    if (confirmImportBtn) confirmImportBtn.onclick = importJsonWords;

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

})();
