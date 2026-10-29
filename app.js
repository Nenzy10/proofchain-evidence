/*
 * ProofChain Evidence — browser wiring.
 * All logic lives in core.js (ProofChainCore); this file only handles
 * DOM, file reading, and presentation. Files are read into memory and
 * hashed locally via Web Crypto — nothing is uploaded anywhere.
 */
(function () {
  'use strict';

  const Core = window.ProofChainCore;
  let lastReceipt = null; // most recent receipt created/updated this session
  let lastReceiptText = '';

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStatus(el, message, kind) {
    el.hidden = false;
    el.textContent = message;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function clearStatus(el) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'status';
  }

  /* ---------------- Tabs ---------------- */

  const tabs = Array.from(document.querySelectorAll('.tab'));
  function showTab(name) {
    tabs.forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    ['create', 'custody', 'verify'].forEach((n) => {
      $('tab-' + n).hidden = n !== name;
    });
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* ---------------- Dropzones ---------------- */

  function wireDropzone(zoneId, inputId, onFile) {
    const zone = $(zoneId);
    const input = $(inputId);
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        input.click();
      }
    });
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) onFile(input.files[0]);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.add('dragging');
      })
    );
    ['dragleave', 'drop'].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        zone.classList.remove('dragging');
      })
    );
    zone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) onFile(files[0]);
    });
  }

  /* ---------------- Receipt helpers ---------------- */

  function rememberReceipt(receipt) {
    lastReceipt = receipt;
    lastReceiptText = JSON.stringify(receipt, null, 2);
  }

  function parseReceipt(text, statusEl) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || parsed.schema !== Core.SCHEMA) {
        throw new Error('This is not a ' + Core.SCHEMA + ' receipt.');
      }
      return parsed;
    } catch (e) {
      setStatus(statusEl, 'Could not read that receipt: ' + e.message, 'error');
      return null;
    }
  }

  function downloadReceipt(text, core) {
    const safeCase = (core.caseId || 'receipt').replace(/[^\w.-]+/g, '_');
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proofchain-' + safeCase + '.receipt.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => (btn.textContent = original), 1500);
    } catch (e) {
      btn.textContent = 'Copy failed — select the JSON manually';
    }
  }

  function factsHtml(core, coreDigest) {
    return (
      '<dt>File</dt><dd>' + esc(core.fileName) + '</dd>' +
      '<dt>Size</dt><dd>' + core.fileSize.toLocaleString() + ' bytes (' + Core.formatBytes(core.fileSize) + ')</dd>' +
      '<dt>SHA-256</dt><dd class="mono">' + esc(core.fileSha256) + '</dd>' +
      '<dt>Case / matter ID</dt><dd>' + esc(core.caseId || '(none)') + '</dd>' +
      '<dt>Hashed at (UTC)</dt><dd>' + esc(core.hashedAt) + '</dd>' +
      '<dt>Receipt digest</dt><dd class="mono">' + esc(coreDigest) + '</dd>'
    );
  }

  /* ---------------- Create ---------------- */

  async function handleCreateFile(file) {
    const status = $('create-status');
    const result = $('create-result');
    result.hidden = true;
    setStatus(status, 'Hashing "' + file.name + '" locally…');
    try {
      const buffer = await file.arrayBuffer();
      const hash = await Core.sha256Hex(buffer);
      const receipt = await Core.createReceipt({
        fileName: file.name,
        fileSize: file.size,
        fileSha256: hash,
        caseId: $('create-case').value.trim(),
        actor: $('create-actor').value.trim(),
      });
      rememberReceipt(receipt);
      $('create-facts').innerHTML = factsHtml(receipt.core, receipt.coreDigest);
      $('create-json').textContent = lastReceiptText;
      result.hidden = false;
      setStatus(
        status,
        'Receipt created. The file was hashed in your browser and never uploaded. ' +
          'Download and store the receipt with the case file.',
        'ok'
      );
    } catch (e) {
      setStatus(status, 'Could not hash that file: ' + e.message, 'error');
    }
  }

  wireDropzone('create-drop', 'create-file', handleCreateFile);
  $('create-download').addEventListener('click', () => {
    if (lastReceipt) downloadReceipt(lastReceiptText, lastReceipt.core);
  });
  $('create-copy').addEventListener('click', (e) => {
    if (lastReceipt) copyText(lastReceiptText, e.currentTarget);
  });
  $('create-tocustody').addEventListener('click', () => {
    if (lastReceipt) $('custody-receipt').value = lastReceiptText;
    showTab('custody');
  });

  /* ---------------- Custody ---------------- */

  $('custody-uselast').addEventListener('click', () => {
    if (lastReceipt) {
      $('custody-receipt').value = lastReceiptText;
      clearStatus($('custody-status'));
    } else {
      setStatus($('custody-status'), 'No receipt created yet in this session — paste one instead.', 'error');
    }
  });

  $('custody-check').addEventListener('click', async () => {
    const status = $('custody-status');
    const receipt = parseReceipt($('custody-receipt').value, status);
    if (!receipt) return;
    const integrity = await Core.verifyReceiptIntegrity(receipt);
    if (integrity.ok) {
      setStatus(status, 'Receipt integrity OK — core digest and custody hash chain verify.', 'ok');
    } else {
      setStatus(status, 'Integrity problems: ' + integrity.problems.join(' '), 'error');
    }
  });

  function renderTimeline(receipt) {
    $('custody-timeline').innerHTML = receipt.custodyLog
      .map(
        (e) =>
          '<li><span class="t-event">' + esc(e.event) + '</span> ' +
          '<span class="t-meta">— ' + esc(e.at) +
          (e.actor ? ' · ' + esc(e.actor) : '') + '</span>' +
          (e.note ? '<br>' + esc(e.note) : '') +
          '<br><span class="t-digest">digest ' + esc(e.digest) + '</span></li>'
      )
      .join('');
  }

  $('custody-append').addEventListener('click', async () => {
    const status = $('custody-status');
    const receipt = parseReceipt($('custody-receipt').value, status);
    if (!receipt) return;
    try {
      const updated = await Core.appendCustodyEvent(receipt, {
        event: $('custody-event').value,
        actor: $('custody-actor').value.trim(),
        note: $('custody-note').value.trim(),
      });
      rememberReceipt(updated);
      $('custody-json').textContent = lastReceiptText;
      renderTimeline(updated);
      $('custody-receipt').value = lastReceiptText;
      $('custody-result').hidden = false;
      setStatus(status, 'Custody event appended. The receipt above is the updated chain of custody.', 'ok');
    } catch (e) {
      setStatus(status, 'Could not append the event: ' + e.message, 'error');
    }
  });

  $('custody-download').addEventListener('click', () => {
    if (lastReceipt) downloadReceipt(lastReceiptText, lastReceipt.core);
  });
  $('custody-copy').addEventListener('click', (e) => {
    if (lastReceipt) copyText(lastReceiptText, e.currentTarget);
  });

  /* ---------------- Verify ---------------- */

  $('verify-uselast').addEventListener('click', () => {
    if (lastReceipt) {
      $('verify-receipt').value = lastReceiptText;
      clearStatus($('verify-status'));
    } else {
      setStatus($('verify-status'), 'No receipt created yet in this session — paste one instead.', 'error');
    }
  });

  async function handleVerifyFile(file) {
    const status = $('verify-status');
    const verdictBox = $('verify-verdict');
    verdictBox.hidden = true;
    const receipt = parseReceipt($('verify-receipt').value, status);
    if (!receipt) return;
    setStatus(status, 'Hashing "' + file.name + '" locally…');
    try {
      const buffer = await file.arrayBuffer();
      const hash = await Core.sha256Hex(buffer);
      const result = await Core.verifyFileAgainstReceipt(receipt, hash);
      clearStatus(status);

      const isMatch = result.verdict === 'MATCH';
      let html =
        '<div class="verdict ' + (isMatch ? 'match' : 'mismatch') + '">' +
        '<h3>' + (isMatch ? '✓ MATCH' : '✗ MISMATCH') + '</h3>';
      if (isMatch) {
        html +=
          '<p>This file is byte-for-byte identical to the file fingerprinted in the receipt, ' +
          'and the receipt (including its chain-of-custody log) is internally intact.</p>';
      } else if (result.fileMatch && !result.receiptIntegrity.ok) {
        html +=
          '<p>The file itself matches the receipt\'s hash, <strong>but the receipt has been altered</strong> ' +
          'since it was created, so it cannot be trusted as issued:</p><ul>' +
          result.receiptIntegrity.problems.map((p) => '<li>' + esc(p) + '</li>').join('') +
          '</ul>';
      } else {
        html +=
          '<p>This file\'s contents differ from the file fingerprinted in the receipt. ' +
          'It may have been modified, corrupted, or it may simply be a different file.</p>';
        if (!result.receiptIntegrity.ok) {
          html +=
            '<p>Additionally, the receipt itself shows integrity problems:</p><ul>' +
            result.receiptIntegrity.problems.map((p) => '<li>' + esc(p) + '</li>').join('') +
            '</ul>';
        }
      }
      html +=
        '<p class="hashline">Expected SHA-256 (receipt):<br>' + esc(result.expectedSha256 || '(none)') + '</p>' +
        '<p class="hashline">Actual SHA-256 (this file):<br>' + esc(result.actualSha256) + '</p>' +
        '<p>Case / matter ID: ' + esc(receipt.core.caseId || '(none)') +
        ' · Hashed at intake (UTC): ' + esc(receipt.core.hashedAt) + '</p>' +
        '</div>';
      verdictBox.innerHTML = html;
      verdictBox.hidden = false;
    } catch (e) {
      setStatus(status, 'Could not verify that file: ' + e.message, 'error');
    }
  }

  wireDropzone('verify-drop', 'verify-file', handleVerifyFile);
})();
