/**
 * Upload de docs (PDF/Word/TXT/CSV) na view Prompt — alimenta o RAG.
 * Abre modal dropzone (Procurar + arrastar) e envia varios arquivos em fila.
 */
(function () {
  var MAX_BYTES = 12 * 1024 * 1024;
  var ACCEPT = '.pdf,.docx,.txt,.md,.csv,application/pdf,text/plain,text/csv,text/markdown';
  var input = null;
  var painelAberto = false;
  var filaBusy = false;

  function base() {
    return typeof window.APP_BASE === 'string' ? window.APP_BASE.replace(/\/$/, '') : '';
  }
  function api(path) { return base() + path; }
  function el(id) { return document.getElementById(id); }

  function setOverlay(id, aberto) {
    var overlay = el(id);
    if (!overlay) return;
    overlay.classList.toggle('open', !!aberto);
    overlay.setAttribute('aria-hidden', aberto ? 'false' : 'true');
  }

  function toastLocal(msg, tipo) {
    var s = el('prompt-docs-status');
    if (!s) return;
    s.className = 'prompt-docs-status' + (tipo ? ' ' + tipo : '');
    s.textContent = msg || '';
  }

  function toastModal(msg, tipo) {
    var s = el('prompt-docs-upload-status');
    if (!s) return;
    s.className = 'pdu-modal-status' + (tipo ? ' ' + tipo : '');
    s.textContent = msg || '';
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function listar() {
    var lista = el('prompt-docs-list');
    if (!lista) return;
    try {
      var r = await fetch(api('/api/ia/conhecimento'), { credentials: 'same-origin' });
      var d = await r.json();
      var docs = (d && d.docs) || [];
      if (!docs.length) {
        lista.innerHTML = '<div class="prompt-docs-hint">Nenhum documento ainda.</div>';
        return;
      }
      lista.innerHTML = docs.map(function (doc) {
        return (
          '<div class="prompt-docs-item" data-id="' + doc.id + '">'
          + '<span class="nome" title="' + (doc.nome || '') + '">' + (doc.nome || 'arquivo') + '</span>'
          + '<span class="meta">' + fmtBytes(doc.tamanho || 0) + ' · ' + (doc.trechos || 0) + ' trechos</span>'
          + '<button type="button" class="pdu-ver" data-ver="' + doc.id + '">Ver</button>'
          + '<button type="button" data-del="' + doc.id + '">Remover</button>'
          + '</div>'
        );
      }).join('');
    } catch (e) {
      toastLocal(e.message || String(e), 'err');
    }
  }

  async function verDocumento(id) {
    if (!id) return;
    setOverlay('modal-prompt-docs-preview', true);
    var titulo = el('prompt-docs-preview-title');
    var body = el('prompt-docs-preview-body');
    if (titulo) titulo.textContent = 'Lendo documento…';
    if (body) body.textContent = 'Carregando texto indexado…';
    try {
      var res = await fetch(api('/api/ia/conhecimento/' + encodeURIComponent(id) + '/texto'), {
        credentials: 'same-origin',
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error((data && data.erro) || 'Falha ao ler documento');
      if (titulo) titulo.textContent = data.nome || 'Documento';
      if (body) body.textContent = data.texto || '(sem texto extraído)';
    } catch (e) {
      if (titulo) titulo.textContent = 'Erro ao abrir';
      if (body) body.textContent = e.message || String(e);
    }
  }

  function fecharPreview() {
    setOverlay('modal-prompt-docs-preview', false);
  }

  function garantirInput() {
    if (input) return input;
    input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.multiple = true;
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      receberArquivos(files);
    });
    return input;
  }

  function abrirModalUpload() {
    setOverlay('modal-prompt-docs-upload', true);
    toastModal('');
    var q = el('prompt-docs-queue');
    if (q && !filaBusy) q.innerHTML = '';
  }

  function fecharModalUpload() {
    setOverlay('modal-prompt-docs-upload', false);
  }

  function abrirModalLista(forceOpen) {
    if (forceOpen === false) {
      setOverlay('modal-prompt-docs-lista', false);
      painelAberto = false;
      return;
    }
    painelAberto = true;
    setOverlay('modal-prompt-docs-lista', true);
    listar();
  }

  function fecharModalLista() {
    setOverlay('modal-prompt-docs-lista', false);
    painelAberto = false;
  }

  function addQueueRow(nome) {
    var q = el('prompt-docs-queue');
    if (!q) return null;
    var li = document.createElement('li');
    li.innerHTML =
      '<span class="q-nome"></span><span class="q-st run">Na fila…</span>';
    li.querySelector('.q-nome').textContent = nome;
    q.appendChild(li);
    return li;
  }

  function setRow(li, texto, cls) {
    if (!li) return;
    var st = li.querySelector('.q-st');
    if (!st) return;
    st.textContent = texto;
    st.className = 'q-st' + (cls ? ' ' + cls : '');
  }

  function readDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('Falha ao ler ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  async function enviarUm(file, li) {
    setRow(li, 'Enviando…', 'run');
    toastLocal('Enviando ' + file.name + '…');
    toastModal('Enviando ' + file.name + '…');
    var dataUrl = await readDataUrl(file);
    var res = await fetch(api('/api/ia/conhecimento'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: file.name,
        mime: file.type,
        data_url: dataUrl,
      }),
    });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.erro) || 'Falha no upload');
    var trechos = data.doc && data.doc.trechos != null ? data.doc.trechos : '?';
    setRow(li, 'OK · ' + trechos + ' trechos', 'ok');
    return data.doc;
  }

  async function receberArquivos(files) {
    var lista = Array.prototype.slice.call(files || []).filter(Boolean);
    if (!lista.length) return;

    var overlay = el('modal-prompt-docs-upload');
    if (overlay && !overlay.classList.contains('open')) abrirModalUpload();

    var ok = 0;
    var fail = 0;
    filaBusy = true;
    for (var i = 0; i < lista.length; i++) {
      var file = lista[i];
      var li = addQueueRow(file.name);
      if (file.size > MAX_BYTES) {
        setRow(li, 'Max. 12 MB', 'err');
        fail++;
        continue;
      }
      try {
        await enviarUm(file, li);
        ok++;
      } catch (e) {
        setRow(li, e.message || 'Erro', 'err');
        fail++;
      }
    }
    filaBusy = false;

    var msg =
      ok + ' enviado(s)' + (fail ? ', ' + fail + ' com erro' : '');
    toastLocal(msg, fail && !ok ? 'err' : 'ok');
    toastModal(msg, fail && !ok ? 'err' : 'ok');
    if (ok) {
      fecharModalUpload();
      abrirModalLista(true);
    }
  }

  async function remover(id) {
    if (!id || !confirm('Remover este documento da base?')) return;
    try {
      var res = await fetch(api('/api/ia/conhecimento/' + encodeURIComponent(id)), {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error((data && data.erro) || 'Falha ao remover');
      toastLocal('Documento removido', 'ok');
      listar();
    } catch (e) {
      toastLocal(e.message || String(e), 'err');
    }
  }

  function wireDropzone() {
    var zone = el('prompt-docs-dropzone');
    if (!zone || zone.dataset.wired) return;
    zone.dataset.wired = '1';

    zone.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.pdu-procurar')) return;
      garantirInput().click();
    });

    var btn = el('prompt-docs-btn-procurar');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        garantirInput().click();
      });
    }

    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
      });
    });
    zone.addEventListener('drop', function (e) {
      var dt = e.dataTransfer;
      receberArquivos(dt && dt.files ? dt.files : []);
    });
  }

  window.promptDocsAbrirArquivo = function () {
    abrirModalUpload();
    wireDropzone();
  };
  window.promptDocsFecharUpload = fecharModalUpload;
  window.promptDocsFecharLista = fecharModalLista;
  window.promptDocsFecharPreview = fecharPreview;
  window.promptDocsTogglePainel = function () {
    var overlay = el('modal-prompt-docs-lista');
    if (overlay && overlay.classList.contains('open')) {
      fecharModalLista();
      return;
    }
    abrirModalLista(true);
  };

  document.addEventListener('click', function (e) {
    var ver = e.target && e.target.closest && e.target.closest('[data-ver]');
    if (ver) {
      verDocumento(ver.getAttribute('data-ver'));
      return;
    }
    var btn = e.target && e.target.closest && e.target.closest('[data-del]');
    if (btn) remover(btn.getAttribute('data-del'));
  });

  document.addEventListener('DOMContentLoaded', function () {
    wireDropzone();
  });
})();
