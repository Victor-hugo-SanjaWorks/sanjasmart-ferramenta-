/**
 * Aba Mídias-gatilho — CRUD + dropzone + menção no editor de prompt.
 * Tool: enviar_midia_gatilho
 */
(function () {
  var editId = null;
  var pendingFile = null;
  var objectUrl = null;
  var inited = false;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function slugMidiaTool(nome) {
    var s = String(nome || 'material')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);
    return s || 'material';
  }

  function tokenMidiaTool(nome) {
    return '@tool-midia-' + slugMidiaTool(nome);
  }

  function formatarMencaoTool(m) {
    var quando =
      String((m && m.prompt_gatilho) || '')
        .trim()
        .replace(/"/g, "'") || 'fizer sentido no papo';
    var token = tokenMidiaTool((m && m.nome) || 'material');
    return (
      'Toda vez que a pessoa chegar em algo como “' +
      quando +
      '”, dispare @tool-enviar_midia_gatilho com ' +
      token +
      ' e só confirme no chat depois do envio.'
    );
  }

  function formatarChipTool(m) {
    return tokenMidiaTool((m && m.nome) || 'material');
  }

  function formatarBlocoToolGenerico() {
    return [
      '~abertura da seção: Mídias e gatilhos~',
      'Quando o papo pedir aula, flyer ou vídeo, use @tool-enviar_midia_gatilho com a mídia certa (@tool-midia-…).',
      'Só diga que enviou depois que o envio acontecer de verdade.',
      '~fim da seção: Mídias e gatilhos~',
    ].join('\n');
  }

  function previewDisparoTool(m) {
    var nome = String((m && m.nome) || 'esse material').trim() || 'esse material';
    var quando = String((m && m.prompt_gatilho) || 'fizer sentido').trim() || 'fizer sentido';
    return (
      'Quando o lead disser algo como “' +
      quando +
      '”, a Maria Eduarda manda “' +
      nome +
      '” no WhatsApp e só então comenta — como passar o material na mão.'
    );
  }

  function mostrarHintEditor(html) {
    var bar = $('prompt-tool-hint');
    var txt = $('prompt-tool-hint-text');
    if (!bar || !txt) return;
    txt.innerHTML = html;
    bar.classList.add('show');
    try {
      bar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_) {}
  }

  async function api(method, path, body) {
    var opts = { method: method, credentials: 'same-origin', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(path, opts);
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || data.ok === false) throw new Error(data.erro || res.statusText);
    return data;
  }

  function setStatus(msg, kind) {
    var el = $('midias-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'midias-status' + (kind ? ' ' + kind : '');
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function inferTipoArquivo(file) {
    var t = (file && file.type) || '';
    if (t.indexOf('image/') === 0) return 'image';
    if (t.indexOf('video/') === 0) return 'video';
    if (t.indexOf('audio/') === 0) return 'audio';
    return 'document';
  }

  function iconeTipo(tipo) {
    if (tipo === 'video') return '🎬';
    if (tipo === 'audio') return '🎧';
    if (tipo === 'document') return '📄';
    return '🖼️';
  }

  function revokePreview() {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (_) {}
      objectUrl = null;
    }
  }

  function limparPreview() {
    revokePreview();
    pendingFile = null;
    var input = $('midia-arquivo');
    if (input) input.value = '';
    var box = $('midia-preview');
    if (!box) return;
    box.classList.remove('show');
    box.innerHTML = '';
  }

  function mostrarPreviewLocal(file) {
    revokePreview();
    pendingFile = file || null;
    var box = $('midia-preview');
    if (!box) return;
    if (!file) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }
    objectUrl = URL.createObjectURL(file);
    var tipo = inferTipoArquivo(file);
    var html = '<button type="button" class="pv-clear" data-act="clear-preview">Remover</button>';
    if (tipo === 'image') {
      html += '<img src="' + objectUrl + '" alt="preview" />';
    } else if (tipo === 'video') {
      html += '<video src="' + objectUrl + '" controls></video>';
    } else if (tipo === 'audio') {
      html +=
        '<div class="pv-audio">🎧 ' +
        esc(file.name) +
        '<br/><audio src="' +
        objectUrl +
        '" controls style="width:100%;margin-top:8px"></audio></div>';
    } else {
      html += '<div class="pv-doc">📄 ' + esc(file.name) + '</div>';
    }
    box.innerHTML = html;
    box.classList.add('show');
    var sel = $('midia-tipo');
    if (sel) sel.value = tipo;
    var nome = $('midia-nome');
    if (nome && !String(nome.value || '').trim()) nome.value = file.name.replace(/\.[^.]+$/, '');
    var clearBtn = box.querySelector('[data-act="clear-preview"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        limparPreview();
      });
    }
  }

  function resetForm() {
    editId = null;
    var formTitle = $('midias-form-title');
    if (formTitle) formTitle.textContent = 'Nova mídia-gatilho';
    var btn = $('midia-salvar-btn');
    if (btn) btn.textContent = 'Salvar mídia';
    var cancel = $('midia-cancelar-btn');
    if (cancel) cancel.hidden = true;
    ['midia-nome', 'midia-prompt', 'midia-legenda'].forEach(function (id) {
      var el = $(id);
      if (el) el.value = '';
    });
    var tipo = $('midia-tipo');
    if (tipo) tipo.value = 'image';
    limparPreview();
    setStatus('');
  }

  function preencherEdicao(m) {
    editId = m.id;
    var formTitle = $('midias-form-title');
    if (formTitle) formTitle.textContent = 'Editar mídia';
    var btn = $('midia-salvar-btn');
    if (btn) btn.textContent = 'Atualizar cadastro';
    var cancel = $('midia-cancelar-btn');
    if (cancel) cancel.hidden = false;
    if ($('midia-nome')) $('midia-nome').value = m.nome || '';
    if ($('midia-prompt')) $('midia-prompt').value = m.prompt_gatilho || '';
    if ($('midia-legenda')) $('midia-legenda').value = m.legenda || '';
    if ($('midia-tipo')) $('midia-tipo').value = m.tipo || 'image';
    limparPreview();
    var box = $('midia-preview');
    if (box) {
      var url = '/api/ia/midias-gatilho/' + encodeURIComponent(m.id) + '/arquivo';
      var html = '';
      if (m.tipo === 'image') html = '<img src="' + url + '" alt="preview" />';
      else if (m.tipo === 'video') html = '<video src="' + url + '" controls></video>';
      else if (m.tipo === 'audio')
        html =
          '<div class="pv-audio">🎧 ' +
          esc(m.nome) +
          '<br/><audio src="' +
          url +
          '" controls style="width:100%;margin-top:8px"></audio></div>';
      else html = '<div class="pv-doc">📄 ' + esc(m.nome) + ' · arquivo já salvo</div>';
      box.innerHTML = html;
      box.classList.add('show');
    }
    setStatus('Editando — troque o arquivo só se quiser substituir (envie nova mídia).', '');
    var formCard = document.querySelector('.midias-form-card');
    if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(texto);
        return true;
      }
    } catch (_) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }

  function inserirNoEditor(texto, previewHtml) {
    var chunk = String(texto == null ? '' : texto);
    if (typeof window.promptInsertText === 'function') {
      window.promptInsertText(chunk);
    } else if (window.teaPromptEditorUx && teaPromptEditorUx.obterTexto && teaPromptEditorUx.definirTexto) {
      var atual = teaPromptEditorUx.obterTexto().replace(/\s*$/, '');
      var add = chunk.replace(/^\n+/, '').replace(/\n+$/, '');
      teaPromptEditorUx.definirTexto(atual + (atual ? '\n' : '') + add + '\n', { restaurarColapso: true });
      var elUx = document.getElementById('prompt-editor');
      if (elUx) elUx.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      var el = document.getElementById('prompt-editor');
      if (!el) return false;
      el.focus();
      try {
        document.execCommand('insertText', false, chunk);
      } catch (_) {
        el.textContent = (el.textContent || '') + '\n' + chunk;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (previewHtml) mostrarHintEditor(previewHtml);
    return true;
  }

  async function carregarLista() {
    var box = $('midias-lista');
    var count = $('midias-count');
    if (!box) return;
    box.innerHTML = '<p class="midias-empty">Carregando…</p>';
    try {
      var data = await api('GET', '/api/ia/midias-gatilho');
      var midias = data.midias || [];
      if (count) count.textContent = midias.length + (midias.length === 1 ? ' item' : ' itens');
      if (!midias.length) {
        box.innerHTML =
          '<div class="midias-empty">Nenhuma mídia ainda.<br/>Cadastre um vídeo/imagem + o <b>prompt gatilho</b> (quando disparar).</div>';
        return;
      }
      box.innerHTML = midias
        .map(function (m) {
          var thumbUrl = '/api/ia/midias-gatilho/' + encodeURIComponent(m.id) + '/arquivo';
          var thumb =
            m.tipo === 'image'
              ? '<img src="' + thumbUrl + '" alt="" loading="lazy" />'
              : m.tipo === 'video'
                ? '<video src="' + thumbUrl + '" muted></video>'
                : '<span>' + iconeTipo(m.tipo) + '</span>';
          return (
            '<article class="midia-item' +
            (m.ativo ? '' : ' inativo') +
            '" data-id="' +
            esc(m.id) +
            '">' +
            '<div class="midia-thumb">' +
            thumb +
            '</div>' +
            '<div class="midia-meta">' +
            '<div class="titulo"><b>' +
            esc(m.nome) +
            '</b><span class="midia-badge">' +
            esc(m.tipo) +
            '</span>' +
            (m.ativo
              ? '<span class="midia-badge">ativo</span>'
              : '<span class="midia-badge off">inativo</span>') +
            '</div>' +
            '<p class="midia-gatilho">' +
            esc(m.prompt_gatilho || '(sem gatilho)') +
            '</p>' +
            '<div class="midia-stats">' +
            '<span class="midia-stat">⚡ ' +
            Number(m.ativacoes || 0) +
            ' disparo' +
            (Number(m.ativacoes || 0) === 1 ? '' : 's') +
            '</span>' +
            (m.ultima_justificativa
              ? '<span class="midia-stat-why" title="' +
                esc(m.ultima_justificativa) +
                '">Última: ' +
                esc(String(m.ultima_justificativa).slice(0, 90)) +
                (String(m.ultima_justificativa).length > 90 ? '…' : '') +
                '</span>'
              : '<span class="midia-stat-why muted">Ainda sem disparo da IA</span>') +
            '</div>' +
            '<div class="midia-id">id=' +
            esc(m.id) +
            '</div>' +
            '<div class="midia-btns">' +
            '<button type="button" data-act="edit">Editar</button>' +
            '<button type="button" data-act="toggle">' +
            (m.ativo ? 'Desativar' : 'Ativar') +
            '</button>' +
            '<button type="button" data-act="copiar">Copiar menção</button>' +
            '<button type="button" data-act="inserir">Inserir no prompt</button>' +
            '<button type="button" data-act="del" class="danger">Excluir</button>' +
            '</div></div></article>'
          );
        })
        .join('');

      box.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var item = btn.closest('.midia-item');
          var id = item && item.getAttribute('data-id');
          if (!id) return;
          var m = midias.find(function (x) {
            return x.id === id;
          });
          try {
            var act = btn.getAttribute('data-act');
            if (act === 'del') {
              if (!confirm('Excluir esta mídia?')) return;
              await api('DELETE', '/api/ia/midias-gatilho/' + id);
              if (editId === id) resetForm();
              setStatus('Mídia excluída.', 'ok');
              await carregarLista();
              return;
            }
            if (act === 'toggle') {
              await api('PATCH', '/api/ia/midias-gatilho/' + id, { ativo: !m.ativo });
              await carregarLista();
              return;
            }
            if (act === 'edit') {
              preencherEdicao(m);
              return;
            }
            if (act === 'copiar') {
              var ok = await copiarTexto(formatarMencaoTool(m));
              setStatus(ok ? 'Menção copiada.' : 'Não foi possível copiar.', ok ? 'ok' : 'err');
              return;
            }
            if (act === 'inserir') {
              if (
                inserirNoEditor(
                  '\n' + formatarMencaoTool(m) + '\n',
                  '<strong>O que vai acontecer:</strong> ' + esc(previewDisparoTool(m)),
                )
              ) {
                setStatus('Gatilho inserido no prompt — veja a dica acima do editor.', 'ok');
                if (typeof window.switchView === 'function') window.switchView('prompt');
              } else {
                setStatus('Abra a aba Prompt para inserir.', 'err');
              }
            }
          } catch (e) {
            alert(e.message || String(e));
          }
        });
      });
      await carregarAtivacoes();
    } catch (e) {
      box.innerHTML = '<p class="midias-empty">Erro: ' + esc(e.message || e) + '</p>';
      if (count) count.textContent = '—';
    }
  }

  function formatarQuando(iso) {
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  async function carregarAtivacoes() {
    var box = $('midias-ativacoes');
    if (!box) return;
    box.innerHTML = '<p class="midias-empty">Carregando disparos…</p>';
    try {
      var data = await api('GET', '/api/ia/midias-gatilho/ativacoes?limite=40');
      var lista = data.ativacoes || [];
      if (!lista.length) {
        box.innerHTML =
          '<div class="midias-empty">Nenhum disparo ainda.<br/>Quando a IA enviar uma mídia no WhatsApp, o motivo aparece aqui.</div>';
        return;
      }
      box.innerHTML = lista
        .map(function (a) {
          return (
            '<div class="midia-ativacao' +
            (a.ok === false ? ' fail' : '') +
            '">' +
            '<div class="at-top"><b>' +
            esc(a.midia_nome || 'mídia') +
            '</b><span>' +
            esc(formatarQuando(a.criado_em)) +
            (a.ok === false ? ' · falhou' : '') +
            '</span></div>' +
            '<p>' +
            esc(a.justificativa || '') +
            '</p>' +
            (a.telefone
              ? '<div class="at-tel">' + esc(a.telefone) + '</div>'
              : '') +
            '</div>'
          );
        })
        .join('');
    } catch (e) {
      box.innerHTML = '<p class="midias-empty">Erro ao carregar disparos: ' + esc(e.message || e) + '</p>';
    }
  }

  async function salvar() {
    var nome = ($('midia-nome') || {}).value || '';
    var prompt = (($('midia-prompt') || {}).value || '').trim();
    var tipo = ($('midia-tipo') || {}).value || 'image';
    var legenda = ($('midia-legenda') || {}).value || '';
    if (!prompt) {
      setStatus('Informe o prompt gatilho (quando disparar).', 'err');
      var pe = $('midia-prompt');
      if (pe) pe.focus();
      return;
    }

    var btn = $('midia-salvar-btn');
    if (btn) btn.disabled = true;
    setStatus('Salvando…', '');
    try {
      if (editId && !pendingFile) {
        await api('PATCH', '/api/ia/midias-gatilho/' + editId, {
          nome: nome || undefined,
          prompt_gatilho: prompt,
          tipo: tipo,
          legenda: legenda,
        });
        setStatus('Cadastro atualizado.', 'ok');
        resetForm();
        await carregarLista();
        return;
      }

      var file = pendingFile;
      var fileInput = $('midia-arquivo');
      if (!file && fileInput && fileInput.files && fileInput.files[0]) {
        file = fileInput.files[0];
      }
      if (!file) {
        setStatus('Selecione um arquivo (imagem, vídeo, áudio ou documento).', 'err');
        return;
      }
      if (file.size > 18 * 1024 * 1024) {
        setStatus(
          'Arquivo grande demais para upload JSON (~18 MB úteis). Use arquivo menor ou comprima o vídeo.',
          'err',
        );
        return;
      }

      var data_url = await fileToDataUrl(file);
      var payload = {
        nome: nome || file.name,
        prompt_gatilho: prompt,
        tipo: tipo,
        legenda: legenda,
        mime: file.type,
        data_url: data_url,
      };

      if (editId) {
        var atualLista = null;
        try {
          var listData = await api('GET', '/api/ia/midias-gatilho');
          atualLista = (listData.midias || []).find(function (x) {
            return x.id === editId;
          });
        } catch (_) {}
        if (atualLista && atualLista.ativo === false) payload.ativo = false;
        await api('PUT', '/api/ia/midias-gatilho/' + editId + '/arquivo', payload);
        setStatus('Arquivo atualizado (mesmo id — menções no prompt seguem válidas).', 'ok');
      } else {
        payload.ativo = true;
        await api('POST', '/api/ia/midias-gatilho', payload);
        setStatus('Mídia cadastrada. Use “Inserir no prompt” ou o botão @Mídia no editor.', 'ok');
      }
      resetForm();
      await carregarLista();
    } catch (e) {
      setStatus(e.message || String(e), 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindDropzone() {
    var dz = $('midia-dropzone');
    var input = $('midia-arquivo');
    if (!dz || !input) return;

    function pick() {
      input.click();
    }
    dz.addEventListener('click', pick);
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0];
      if (f) mostrarPreviewLocal(f);
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        dz.classList.remove('dragover');
      });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      try {
        var dt = new DataTransfer();
        dt.items.add(f);
        input.files = dt.files;
      } catch (_) {
        /* Safari antigo: só preview local */
      }
      mostrarPreviewLocal(f);
    });
  }

  function fecharModalMencao() {
    var modal = $('modal-midias-mencao');
    if (modal) {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  async function abrirModalMencao() {
    if (typeof window.capturarAlvoInsercaoPrompt === 'function') {
      window.capturarAlvoInsercaoPrompt();
    }
    var modal = $('modal-midias-mencao');
    var list = $('midias-mencao-list');
    if (!modal || !list) {
      console.warn('[midias] modal-midias-mencao ausente no DOM');
      window.alert('Não encontrei o seletor de gatilhos. Atualize a página (Ctrl+Shift+R) e tente de novo.');
      return;
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    list.innerHTML = '<p class="midias-empty">Carregando…</p>';
    try {
      var data = await api('GET', '/api/ia/midias-gatilho');
      var midias = (data.midias || []).filter(function (m) {
        return m.ativo !== false;
      });
      var html =
        '<div class="midias-mencao-item"><div class="info"><b>✨ Lembrete geral de gatilhos</b>' +
        '<span>Insere um bloco curto e humano: quando pedir ver algo, use a ferramenta de mídia.</span></div>' +
        '<div class="acts"><button type="button" data-act="gen">Inserir lembrete</button></div></div>';
      if (!midias.length) {
        html +=
          '<p class="midias-empty">Nenhum gatilho ativo ainda.<br/>Cadastre em <b>Gatilhos e ferramentas</b> e volte aqui.</p>';
      } else {
        html += midias
          .map(function (m) {
            return (
              '<div class="midias-mencao-item" data-id="' +
              esc(m.id) +
              '"><div class="info"><b>' +
              esc(iconeTipo(m.tipo) + ' ' + m.nome) +
              '</b><span>' +
              esc(m.prompt_gatilho || '') +
              '</span><span class="midias-mencao-preview">' +
              esc(previewDisparoTool(m)) +
              '</span></div><div class="acts">' +
              '<button type="button" data-act="full">Inserir no prompt</button>' +
              '<button type="button" data-act="chip">Atalho curto</button>' +
              '</div></div>'
            );
          })
          .join('');
      }
      list.innerHTML = html;
      list.querySelectorAll('[data-act]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var act = btn.getAttribute('data-act');
          if (act === 'gen') {
            inserirNoEditor(
              '\n' + formatarBlocoToolGenerico() + '\n',
              '<strong>O que vai acontecer:</strong> a IA ganha um lembrete amigável: se o lead pedir ver algo, ela usa a ferramenta de mídia — sem fingir que enviou.',
            );
            fecharModalMencao();
            return;
          }
          var row = btn.closest('.midias-mencao-item');
          var id = row && row.getAttribute('data-id');
          var m = midias.find(function (x) {
            return x.id === id;
          });
          if (!m) return;
          var texto = act === 'chip' ? formatarChipTool(m) : formatarMencaoTool(m);
          inserirNoEditor(
            '\n' + texto + '\n',
            '<strong>O que vai acontecer:</strong> ' + esc(previewDisparoTool(m)),
          );
          fecharModalMencao();
        });
      });
    } catch (e) {
      list.innerHTML = '<p class="midias-empty">Erro: ' + esc(e.message || e) + '</p>';
    }
  }

  function bindForm() {
    var btn = $('midia-salvar-btn');
    if (btn) {
      btn.addEventListener('click', function () {
        salvar().catch(function (e) {
          setStatus(e.message || String(e), 'err');
        });
      });
    }
    var cancel = $('midia-cancelar-btn');
    if (cancel) {
      cancel.addEventListener('click', function () {
        resetForm();
      });
    }
    var refresh = $('midias-refresh-btn');
    if (refresh) {
      refresh.addEventListener('click', function () {
        carregarLista();
      });
    }
  }

  window.teaMidiasGatilho = {
    carregarLista: carregarLista,
    carregarAtivacoes: carregarAtivacoes,
    salvar: salvar,
    formatarMencaoTool: formatarMencaoTool,
    formatarChipTool: formatarChipTool,
    formatarBlocoToolGenerico: formatarBlocoToolGenerico,
    previewDisparoTool: previewDisparoTool,
    mostrarHintEditor: mostrarHintEditor,
    abrirInserirNoPrompt: abrirModalMencao,
    fecharInserirNoPrompt: fecharModalMencao,
    init: function () {
      if (!inited) {
        bindDropzone();
        bindForm();
        inited = true;
      }
      carregarLista();
    },
  };
})();
