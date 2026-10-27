import { api, ApiError } from '../api.js';
import {
  avatarHtml, emptyState, escapeHtml, formatTime, loading, relativeTime, setLoading, toast,
} from '../ui.js';
import { state, refreshCounts } from '../app.js';

export async function render(container, params) {
  const hash = window.location.hash.replace(/^#/, '');
  const path = hash.split('?')[0];
  const convoId = path === '/chats' ? null : Number(path.split('/')[2]);

  container.innerHTML = `
    <section class="section"><div class="container">
      <h1>Wada hadallada</h1>
      <div class="chat-layout">
        <aside class="chat-sidebar" data-role="sidebar">${loading()}</aside>
        <section class="chat-main" data-role="main">
          ${emptyState('Dooro wada hadal', 'Codsiyada iyo wada hadalladaada wuu halkan ka muuq doonaan.', '💬')}
        </section>
      </div>
    </div></section>`;

  const sidebar = container.querySelector('[data-role="sidebar"]');
  const main = container.querySelector('[data-role="main"]');

  async function loadSidebar() {
    sidebar.innerHTML = loading();
    try {
      const result = await api.get('/api/chat-requests');
      const conversations = await api.get('/api/conversations');
      state.counts = conversations.counts || state.counts;

      const incomingPending = result.incoming.filter((r) => r.status === 'PENDING');
      const incomingOther = result.incoming.filter((r) => r.status !== 'PENDING');
      const outgoingPending = result.outgoing.filter((r) => r.status === 'PENDING');

      sidebar.innerHTML = `
        <h2>Wada hadallada</h2>
        <div class="chat-tabs" role="tablist">
          <button class="chat-tab active" data-tab="conversations" role="tab">Wada hadallada</button>
          <button class="chat-tab" data-tab="requests" role="tab">
            Codsiyada${incomingPending.length ? ` (${incomingPending.length})` : ''}
          </button>
        </div>

        <div data-panel="conversations">
          ${conversations.conversations.length ? `<ul class="plain-list">${conversations.conversations.map((c) => `
            <li><a class="chat-item ${convoId === c.id ? 'active' : ''}" href="#/chats/${c.id}">
              ${avatarHtml(c.peer, 'sm')}
              <span class="chat-item-body">
                <span class="chat-item-name">${escapeHtml(c.peer.full_name)}</span>
                <span class="chat-item-preview">${escapeHtml(c.last_message || 'Wada hadalkani ma jiro fariin.')}</span>
              </span>
              ${c.unread ? `<span class="badge badge-count">${c.unread}</span>` : ''}
            </a></li>`).join('')}</ul>`
            : '<p class="muted">Weli wada hadal ma jiro. Codsi dir qof kale.</p>'}
        </div>

        <div data-panel="requests" hidden>
          <h3>Codsiyada soo dhaafay</h3>
          ${incomingPending.length ? `<ul class="plain-list">${incomingPending.map((r) => `
            <li class="list-row">
              ${avatarHtml(r, 'sm')}
              <span class="chat-item-body">
                <span class="chat-item-name">${escapeHtml(r.full_name)}</span>
                <span class="chat-item-preview">${escapeHtml(r.city || '')} · ${escapeHtml(r.occupation || '')}</span>
              </span>
              <span class="row-actions">
                <button class="btn btn-green btn-sm" data-accept="${r.id}">Qaado</button>
                <button class="btn btn-ghost btn-sm" data-reject="${r.id}">Diid</button>
              </span>
            </li>`).join('')}</ul>`
            : '<p class="muted">Codsi cusub ma jiro.</p>'}

          ${incomingOther.length ? `<h3 style="margin-top:1rem">Codsiyada hore</h3>
            <ul class="plain-list">${incomingOther.map((r) => `
              <li class="list-row">
                ${avatarHtml(r, 'sm')}
                <span class="chat-item-body">
                  <span class="chat-item-name">${escapeHtml(r.full_name)}</span>
                  <span class="chat-item-preview">${r.status === 'ACCEPTED' ? 'Waa la qaatay' : 'Waa la diiday'}</span>
                </span>
              </li>`).join('')}</ul>` : ''}

          ${outgoingPending.length ? `<h3 style="margin-top:1rem">Codsiyadaa diray</h3>
            <ul class="plain-list">${outgoingPending.map((r) => `
              <li class="list-row">
                ${avatarHtml(r, 'sm')}
                <span class="chat-item-body">
                  <span class="chat-item-name">${escapeHtml(r.full_name)}</span>
                  <span class="chat-item-preview">Waa sugaysa</span>
                </span>
              </li>`).join('')}</ul>` : ''}
        </div>`;

      sidebar.querySelectorAll('.chat-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          sidebar.querySelectorAll('.chat-tab').forEach((t) => t.classList.toggle('active', t === tab));
          sidebar.querySelectorAll('[data-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.panel !== tab.dataset.tab;
          });
        });
      });

      sidebar.querySelectorAll('[data-accept]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const result2 = await api.post(`/api/chat-requests/${btn.dataset.accept}/accept`, {});
            toast(result2.message, 'success');
            await loadSidebar();
            if (result2.conversation) openConversation(result2.conversation.id);
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
            btn.disabled = false;
          }
        });
      });

      sidebar.querySelectorAll('[data-reject]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const result2 = await api.post(`/api/chat-requests/${btn.dataset.reject}/reject`, {});
            toast(result2.message, 'success');
            await loadSidebar();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      sidebar.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  async function openConversation(id) {
    main.innerHTML = loading();
    try {
      const result = await api.get(`/api/conversations/${id}/messages`);
      const conversation = await api.get('/api/conversations');
      const current = conversation.conversations.find((c) => c.id === Number(id));
      const peer = current?.peer || { full_name: 'Qof', profile_photo_url: null };

      main.innerHTML = `
        <div class="chat-head">
          ${avatarHtml(peer, 'sm')}
          <div>
            <strong>${escapeHtml(peer.full_name)}</strong>
            <p class="muted" style="margin:0">Wada hadal kaliya.</p>
          </div>
          <div class="member-actions" style="margin-left:auto">
            <button class="btn btn-outline btn-sm" data-role="block">Xannibi</button>
            <button class="btn btn-danger btn-sm" data-role="report">Warbixin</button>
          </div>
        </div>
        <div class="messages" data-role="messages">
          ${result.messages.length ? result.messages.map(messageHtml).join('')
            : '<p class="muted">Fariin walba ka qor. Wada hadalkan waa kaliya labada qof.</p>'}
        </div>
        <form class="message-form" data-role="composer">
          <label class="skip-link" for="message-input">Fariin</label>
          <input id="message-input" name="message_text" autocomplete="off" placeholder="Qor fariin…" required />
          <button class="btn btn-green" type="submit">Dir</button>
        </form>`;

      const composer = main.querySelector('[data-role="composer"]');
      composer.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = composer.querySelector('#message-input');
        const text = input.value.trim();
        if (!text) return;
        const button = composer.querySelector('button');
        setLoading(button, true, 'Waa la dirayaa…');
        try {
          const result2 = await api.post(`/api/conversations/${id}/messages`, { message_text: text });
          input.value = '';
          appendMessage(result2.message);
          await refreshCounts();
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Fariinka ma la dirin.', 'error');
        } finally {
          setLoading(button, false);
        }
      });

      main.querySelector('[data-role="block"]').addEventListener('click', async () => {
        const peerId = result.peer_id;
        try {
          const result2 = await api.post('/api/notifications/blocks', { blocked_id: peerId });
          toast(result2.message, 'success');
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
        }
      });

      main.querySelector('[data-role="report"]').addEventListener('click', async () => {
        const reason = window.prompt('Sababta warbixinta?');
        if (!reason) return;
        try {
          const result2 = await api.post('/api/notifications/reports', {
            reported_user_id: result.peer_id,
            reason: reason.trim(),
            conversation_id: Number(id),
          });
          toast(result2.message, 'success');
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
        }
      });

      scrollMessages();
    } catch (err) {
      main.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function messageHtml(message) {
    const mine = Number(message.sender_id) === Number(state.user?.id);
    const deleted = !!message.deleted_at;
    const text = deleted ? 'Fariinka waa la tirtiray' : escapeHtml(message.message_text);
    return `
      <div class="message ${mine ? 'mine' : 'theirs'}" data-id="${message.id}">
        <div class="bubble">
          ${deleted ? `<em class="muted">${text}</em>` : text}
          ${message.edited_at ? '<span class="muted"> (waa la beddelay)</span>' : ''}
        </div>
        <div class="message-meta">
          <span>${formatTime(message.created_at)}</span>
          ${mine && !deleted ? `
            <button class="link-btn" data-edit="${message.id}">Wax ka beddel</button>
            <button class="link-btn danger" data-delete="${message.id}">Tirtiri</button>` : ''}
        </div>
      </div>`;
  }

  function appendMessage(message) {
    const host = main.querySelector('[data-role="messages"]');
    if (!host) return;
    host.querySelector('p.muted')?.remove();
    host.insertAdjacentHTML('beforeend', messageHtml(message));
    bindMessageActions(host);
    scrollMessages();
  }

  function bindMessageActions(host) {
    host.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.edit;
        const current = await api.get(`/api/conversations/${convoId}/messages`);
        const message = current.messages.find((m) => String(m.id) === String(id));
        const next = window.prompt('Fariinka cusub:', message?.message_text || '');
        if (next === null) return;
        try {
          await api.patch(`/api/messages/${id}`, { message_text: next });
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
        }
      });
    });
    host.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!window.confirm('Ma uun ma tirtiraysaan fariinkan?')) return;
        try {
          const result = await api.del(`/api/messages/${btn.dataset.delete}`);
          toast(result.message, 'success');
          await openConversation(convoId);
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Wax qalab ah ayaa jaba.', 'error');
        }
      });
    });
  }

  function scrollMessages() {
    const host = main.querySelector('[data-role="messages"]');
    if (host) host.scrollTop = host.scrollHeight;
  }

  await loadSidebar();
  if (convoId) await openConversation(convoId);

  // Live updates: new messages arrive without a page refresh.
  if (state.events) {
    const onMessage = async (event) => {
      const data = JSON.parse(event.data);
      if (!convoId || Number(data.conversation_id) === Number(convoId)) {
        if (convoId) {
          const fresh = await api.get(`/api/conversations/${convoId}/messages`);
          const host = main.querySelector('[data-role="messages"]');
          if (host) {
            host.innerHTML = fresh.messages.length ? fresh.messages.map(messageHtml).join('')
              : '<p class="muted">Fariin walba ka qor. Wada hadalkan waa kaliya labada qof.</p>';
            bindMessageActions(host);
            scrollMessages();
          }
        }
        await loadSidebar();
        await refreshCounts();
      }
    };
    state.events.addEventListener('message', onMessage);
    state.events.addEventListener('message_updated', onMessage);
    state.events.addEventListener('message_deleted', onMessage);
    state.events.addEventListener('conversation_update', loadSidebar);
  }
  void relativeTime;
}
