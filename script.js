(function () {
  "use strict";

  var EXPENSE_CATEGORIES = ['Moradia','Alimentação','Transporte','Saúde','Lazer','Educação','Outros'];
  var INCOME_CATEGORIES = ['Salário','Freelance','Investimentos','Outros'];
  var STORAGE_KEY = 'livro_caixa_state_v2';
  var MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function todayISO() { return new Date().toISOString().slice(0,10); }

  function defaultState() {
    return {
      transactions: [],
      budgets: {},
      assets: [],
      savingsGoal: 0,
      selectedMonth: todayISO().slice(0,7)
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      console.error('Não foi possível carregar os dados salvos:', e);
      return defaultState();
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.error('Não foi possível salvar os dados:', e); }
  }

  var state = loadState();
  var currentType = 'despesa';

  function fmt(value) {
    try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
    catch (e) { return 'R$ ' + Number(value).toFixed(2); }
  }
  function fmtPct(v) {
    if (!isFinite(v)) return '0%';
    return (Math.round(v * 10) / 10) + '%';
  }
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function monthKeyToLabel(key) {
    var p = key.split('-');
    return MONTH_NAMES[parseInt(p[1],10)-1] + ' de ' + p[0];
  }
  function shiftMonth(key, delta) {
    var p = key.split('-');
    var d = new Date(parseInt(p[0],10), parseInt(p[1],10) - 1 + delta, 1);
    return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0');
  }
  function txMonthKey(tx) { return tx.date.slice(0,7); }
  function txForMonth(key) { return state.transactions.filter(function (t) { return txMonthKey(t) === key; }); }
  function monthTotals(key) {
    var txs = txForMonth(key), income = 0, expense = 0;
    txs.forEach(function (t) { if (t.type === 'receita') income += t.amount; else expense += t.amount; });
    return { income: income, expense: expense, balance: income - expense };
  }
  function netWorth() { return state.assets.reduce(function (s,a) { return s + a.value; }, 0); }
  function totalBudget() {
    return Object.keys(state.budgets).reduce(function (s,c) { return s + (state.budgets[c] || 0); }, 0);
  }

  // ---------- rendering ----------

  function renderHeader() {
    document.getElementById('monthLabel').textContent = monthKeyToLabel(state.selectedMonth);
  }

  function renderDashboard() {
    var totals = monthTotals(state.selectedMonth);
    var savingsRate = totals.income > 0 ? (totals.balance / totals.income) * 100 : 0;

    var grid = document.getElementById('statGrid');
    grid.innerHTML =
      statCard('green', arrowUpIcon(), 'REALIZADO', 'Receitas recebidas', fmt(totals.income), '') +
      statCard('red', arrowDownIcon(), 'REALIZADO', 'Despesas pagas', fmt(totals.expense), '') +
      statCard('blue', dollarIcon(), 'LÍQUIDO', 'Resultado mensal', fmt(totals.balance), totals.balance < 0 ? 'red' : '') +
      statCard('purple', pctIcon(), 'DESEMPENHO', 'Taxa de poupança', fmtPct(savingsRate), savingsRate < 0 ? 'red' : '');

    // goal card
    var goal = state.savingsGoal || 0;
    var achievedPct = goal > 0 ? Math.max(0, Math.min(999, (totals.balance / goal) * 100)) : 0;
    var goalCard = document.getElementById('goalCard');
    goalCard.innerHTML =
      '<div class="goal-head"><div class="stat-icon">' + targetIcon() + '</div><div class="goal-title">Meta de economia</div></div>' +
      '<div><span class="goal-pct">' + fmtPct(Math.min(achievedPct, 999)) + '</span><span class="goal-pct-label">ATINGIDO</span></div>' +
      '<div class="progress-track"><div class="progress-fill' + (totals.balance < 0 ? ' over' : '') + '" style="width:' + Math.max(2, Math.min(100, achievedPct)) + '%"></div></div>' +
      '<div class="progress-labels"><span>REALIZADO: ' + fmt(totals.balance) + '</span><span>META: ' + fmt(goal) + '</span></div>';

    // budget card
    var spent = 0;
    txForMonth(state.selectedMonth).forEach(function (t) { if (t.type === 'despesa') spent += t.amount; });
    var budget = totalBudget();
    var budgetPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    var budgetCard = document.getElementById('budgetCard');
    budgetCard.innerHTML =
      '<div class="mini-card-top"><h3 style="margin:0;">Orçamento do mês</h3></div>' +
      '<div class="mini-value">' + fmt(spent) + (budget > 0 ? ' <span style="color:var(--text-faint);font-weight:500;font-size:0.78rem;">de ' + fmt(budget) + '</span>' : '') + '</div>' +
      '<div class="progress-track"><div class="progress-fill' + (spent > budget && budget > 0 ? ' over' : '') + '" style="width:' + (budget > 0 ? Math.max(2,budgetPct) : 0) + '%"></div></div>' +
      '<div class="progress-labels"><span>GASTO</span><span>' + (budget > 0 ? 'PREVISTO' : 'SEM LIMITE DEFINIDO') + '</span></div>';

    // net worth card
    var nwCard = document.getElementById('networthCard');
    nwCard.innerHTML =
      '<div class="mini-card-top"><h3 style="margin:0;">Patrimônio total</h3></div>' +
      '<div class="mini-value">' + fmt(netWorth()) + '</div>' +
      '<div class="progress-labels" style="margin-top:2px;"><span>' + state.assets.length + ' ativo(s) cadastrado(s)</span></div>';

    // category breakdown
    var byCat = {};
    txForMonth(state.selectedMonth).forEach(function (t) { if (t.type === 'despesa') byCat[t.category] = (byCat[t.category]||0) + t.amount; });
    var catContainer = document.getElementById('categoryBreakdown');
    var cats = Object.keys(byCat).sort(function (a,b) { return byCat[b]-byCat[a]; });
    if (cats.length === 0) {
      catContainer.innerHTML = '<div class="empty-state">Nenhuma despesa registrada neste mês ainda.</div>';
    } else {
      var max = Math.max.apply(null, cats.map(function (c) { return byCat[c]; }));
      catContainer.innerHTML = cats.map(function (c) {
        var pct = max > 0 ? Math.round((byCat[c]/max)*100) : 0;
        var overBudget = state.budgets[c] && byCat[c] > state.budgets[c];
        return '<div class="cat-row"><div class="cat-row-top"><span>' + c + '</span><span class="amt">' + fmt(byCat[c]) + '</span></div>' +
          '<div class="cat-bar-track"><div class="cat-bar-fill' + (overBudget ? ' over' : '') + '" style="width:' + pct + '%"></div></div></div>';
      }).join('');
    }

    // trend
    var chart = document.getElementById('trendChart');
    var keys = []; for (var i=5;i>=0;i--) keys.push(shiftMonth(state.selectedMonth, -i));
    var balances = keys.map(function (mk) { return monthTotals(mk).balance; });
    var maxAbs = Math.max(1, Math.max.apply(null, balances.map(Math.abs)));
    chart.innerHTML = keys.map(function (mk, idx) {
      var bal = balances[idx];
      var pct = Math.max(4, Math.round((Math.abs(bal)/maxAbs)*100));
      var cls = bal < 0 ? 'neg' : 'pos';
      var lbl = MONTH_NAMES[parseInt(mk.split('-')[1],10)-1].slice(0,3);
      return '<div class="trend-col"><div class="trend-bar-wrap"><div class="trend-bar ' + cls + '" style="height:' + pct + '%"></div></div><span class="trend-month">' + lbl + '</span></div>';
    }).join('');
  }

  function statCard(color, icon, tag, label, value, valueCls) {
    return '<div class="card stat-card">' +
      '<div class="stat-top"><div class="stat-icon ' + color + '">' + icon + '</div><span class="stat-tag">' + tag + '</span></div>' +
      '<div><div class="stat-label">' + label + '</div><div class="stat-value ' + (valueCls||'') + '">' + value + '</div></div>' +
      '</div>';
  }
  function arrowUpIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>'; }
  function arrowDownIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 7 7 17M17 17H7V7"/></svg>'; }
  function dollarIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.3c0 3 6 1.4 6 4.3 0 1.3-1.3 2.4-3 2.4s-3-1-3-2.4"/></svg>'; }
  function pctIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 18 12-12"/><circle cx="7.5" cy="7.5" r="1.7"/><circle cx="16.5" cy="16.5" r="1.7"/></svg>'; }
  function targetIcon() { return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>'; }

  function populateCategorySelect() {
    var sel = document.getElementById('txCategory');
    var list = currentType === 'receita' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    sel.innerHTML = list.map(function (c) { return '<option>' + c + '</option>'; }).join('');
  }

  function renderTransactions() {
    var list = document.getElementById('txList');
    var txs = txForMonth(state.selectedMonth).slice().sort(function (a,b) { return b.date.localeCompare(a.date); });
    if (txs.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhuma movimentação neste mês. Adicione a primeira acima.</div>';
      return;
    }
    list.innerHTML = txs.map(function (t) {
      var dateShort = t.date.slice(8,10) + '/' + t.date.slice(5,7);
      return '<div class="tx-row"><span class="tx-date">' + dateShort + '</span>' +
        '<span><span class="tx-desc">' + escapeHTML(t.desc) + '</span><span class="tx-cat">' + t.category + '</span></span>' +
        '<span class="tx-amount ' + (t.type === 'receita' ? 'green' : 'red') + '">' + (t.type === 'receita' ? '+' : '−') + fmt(t.amount).replace('R$','').trim() + '</span>' +
        '<button class="tx-del" aria-label="Remover movimentação" data-id="' + t.id + '">×</button></div>';
    }).join('');
  }

  function renderBudget() {
    var container = document.getElementById('budgetList');
    var byCat = {};
    txForMonth(state.selectedMonth).forEach(function (t) { if (t.type === 'despesa') byCat[t.category] = (byCat[t.category]||0) + t.amount; });
    container.innerHTML = EXPENSE_CATEGORIES.map(function (cat) {
      var spent = byCat[cat] || 0;
      var limit = state.budgets[cat] || 0;
      var pct = limit > 0 ? Math.min(100, Math.round((spent/limit)*100)) : 0;
      var over = limit > 0 && spent > limit;
      return '<div class="cat-row"><div class="cat-row-top"><span>' + cat + '</span><span class="amt">' + fmt(spent) + (limit>0 ? ' de ' + fmt(limit) : '') + '</span></div>' +
        '<div class="cat-bar-track"><div class="cat-bar-fill' + (over?' over':'') + '" style="width:' + pct + '%"></div></div>' +
        '<div style="margin-top:8px; display:flex; align-items:center; gap:8px;">' +
        '<label style="font-size:0.7rem; color:var(--text-faint);" for="budget-' + cat + '">Limite mensal</label>' +
        '<input type="number" min="0" step="0.01" class="budget-input" id="budget-' + cat + '" value="' + (limit||'') + '" placeholder="0,00">' +
        '</div></div>';
    }).join('');
  }

  function renderAssets() {
    var list = document.getElementById('assetList');
    if (state.assets.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum ativo cadastrado ainda. Adicione contas, investimentos ou bens acima.</div>';
    } else {
      list.innerHTML = state.assets.slice().sort(function (a,b) { return b.value-a.value; }).map(function (a) {
        return '<div class="ledger-line"><span class="label">' + escapeHTML(a.name) + '<span class="tx-cat" style="display:block;">' + a.type + '</span></span>' +
          '<span style="display:flex; align-items:center; gap:10px;"><span class="value">' + fmt(a.value) + '</span>' +
          '<button class="tx-del" aria-label="Remover ativo" data-asset-id="' + a.id + '">×</button></span></div>';
      }).join('');
    }
    document.getElementById('assetsTotal').textContent = fmt(netWorth());
  }

  function renderGoals() {
    document.getElementById('goalInput').value = state.savingsGoal || '';
    var totals = monthTotals(state.selectedMonth);
    var goal = state.savingsGoal || 0;
    var pct = goal > 0 ? Math.max(0, Math.min(999, (totals.balance/goal)*100)) : 0;
    var card = document.getElementById('goalDetailCard');
    card.innerHTML =
      '<h3>Progresso — ' + monthKeyToLabel(state.selectedMonth) + '</h3>' +
      '<div class="mini-value" style="font-size:1.6rem; margin-top:6px;">' + fmtPct(Math.min(pct,999)) + ' <span style="font-size:0.8rem; color:var(--text-faint); font-weight:500;">da meta atingida</span></div>' +
      '<div class="progress-track"><div class="progress-fill' + (totals.balance<0?' over':'') + '" style="width:' + Math.max(2,Math.min(100,pct)) + '%"></div></div>' +
      '<div class="progress-labels"><span>REALIZADO: ' + fmt(totals.balance) + '</span><span>META: ' + fmt(goal) + '</span></div>' +
      (goal === 0 ? '<p class="subtitle" style="margin-top:14px;">Defina uma meta acima para acompanhar seu progresso.</p>' : '');
  }

  function renderAll() {
    renderHeader();
    renderDashboard();
    renderTransactions();
    renderBudget();
    renderAssets();
    renderGoals();
  }

  // ---------- events ----------

  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.nav-item').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      document.getElementById('pageTitle').textContent = btn.dataset.title;
      document.getElementById('pageSubtitle').textContent = btn.dataset.subtitle;
      closeSidebar();
    });
  });

  var sidebar = document.getElementById('sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  function openSidebar() { sidebar.classList.add('open'); overlay.classList.add('open'); }
  function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
  document.getElementById('menuToggle').addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  document.getElementById('prevMonth').addEventListener('click', function () { state.selectedMonth = shiftMonth(state.selectedMonth, -1); renderAll(); });
  document.getElementById('nextMonth').addEventListener('click', function () { state.selectedMonth = shiftMonth(state.selectedMonth, 1); renderAll(); });

  document.querySelectorAll('.type-toggle button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentType = btn.dataset.type;
      document.querySelectorAll('.type-toggle button').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      populateCategorySelect();
    });
  });

  document.getElementById('txForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = document.getElementById('txDate').value || todayISO();
    var amount = parseFloat(document.getElementById('txAmount').value);
    var desc = document.getElementById('txDesc').value.trim();
    var category = document.getElementById('txCategory').value;
    if (!desc || isNaN(amount) || amount <= 0) return;
    state.transactions.push({ id: 'tx_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), date: date, amount: amount, desc: desc, category: category, type: currentType });
    state.selectedMonth = date.slice(0,7);
    saveState();
    e.target.reset();
    document.getElementById('txDate').value = date;
    renderAll();
  });

  document.getElementById('txList').addEventListener('click', function (e) {
    var btn = e.target.closest('.tx-del'); if (!btn) return;
    state.transactions = state.transactions.filter(function (t) { return t.id !== btn.dataset.id; });
    saveState(); renderAll();
  });

  document.getElementById('budgetList').addEventListener('change', function (e) {
    if (!e.target.classList.contains('budget-input')) return;
    var cat = e.target.id.replace('budget-', '');
    var val = parseFloat(e.target.value);
    if (isNaN(val) || val <= 0) delete state.budgets[cat]; else state.budgets[cat] = val;
    saveState(); renderBudget(); renderDashboard();
  });

  document.getElementById('assetForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = document.getElementById('assetName').value.trim();
    var type = document.getElementById('assetType').value;
    var value = parseFloat(document.getElementById('assetValue').value);
    if (!name || isNaN(value) || value < 0) return;
    state.assets.push({ id: 'asset_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name: name, type: type, value: value, date: todayISO() });
    saveState(); e.target.reset(); renderAll();
  });

  document.getElementById('assetList').addEventListener('click', function (e) {
    var btn = e.target.closest('.tx-del'); if (!btn) return;
    state.assets = state.assets.filter(function (a) { return a.id !== btn.dataset.assetId; });
    saveState(); renderAll();
  });

  document.getElementById('goalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var val = parseFloat(document.getElementById('goalInput').value);
    state.savingsGoal = isNaN(val) || val < 0 ? 0 : val;
    saveState(); renderAll();
  });

  // ---------- init ----------
  document.getElementById('txDate').value = todayISO();
  populateCategorySelect();
  renderAll();
})();
