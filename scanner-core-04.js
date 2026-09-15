function extractBank(text, src){
  const [date,dateSource]=ocrStatementEnd(text, src);
  const sum=parseOcrSummary(text, src);
  let r=extractBankBase(text, src);
  if(date){ r.statement_end=isoDate(date); r.month_label=MONTH_LABEL[date.getMonth()+1]; r.date_source=dateSource; }
  const bank=ocrDetectBank(text, src); if(bank) r.bank=bank;
  const acct=ocrExtractAccount(text, src); if(acct) r.account=acct;
  if(sum){
    if(sum.deposits!=null) r.deposits=sum.deposits;
    if(sum.ending!=null) r.ending=sum.ending;
    r.confidence=Math.max(r.confidence||0,sum.confidence||95);
    r.evidence=sum.evidence;
  }
  return r;
}
function buildFinal() {
  const apps = {};
  const banks = [];

  for (const record of STATE.records) {
    const group = cleanSpace(record.folder || sourceGroupKey(record.src));
    record.folder = group;
    if (record.kind === 'application') {
      const current = apps[group];
      if (!current || (Number(record.revenue) || 0) > (Number(current.revenue) || 0)) apps[group] = record;
    } else if (record.kind === 'bank') {
      banks.push(record);
    }
  }

  const groups = [...new Set([...Object.keys(apps), ...banks.map(record => record.folder)])].filter(Boolean).sort();
  const rows = [];

  for (const group of groups) {
    const app = apps[group] || {};
    const bankRecords = banks.filter(record => record.folder === group);
    const completed = bankRecords.filter(record => !record.is_mtd);
    const mtdRecords = bankRecords.filter(record => record.is_mtd);

    const uniqueMap = new Map();
    for (const record of completed) {
      const key = [
        record.statement_end || '',
        normAcct(record.account || ''),
        cleanSpace(record.bank || ''),
        Math.round((Number(record.deposits) || 0) * 100),
        Math.round((Number(record.ending) || 0) * 100)
      ].join('|');
      const current = uniqueMap.get(key);
      if (!current || Number(record.confidence || 0) > Number(current.confidence || 0)) uniqueMap.set(key, record);
    }

    const accountGroups = new Map();
    for (const record of uniqueMap.values()) {
      const accountKey = [cleanSpace(record.bank || 'Bank'), normAcct(record.account || '') || 'unknown'].join('|');
      if (!accountGroups.has(accountKey)) accountGroups.set(accountKey, []);
      accountGroups.get(accountKey).push(record);
    }

    const statementDetails = [];
    for (const records of accountGroups.values()) {
      records.sort((a, b) => String(b.statement_end || '').localeCompare(String(a.statement_end || '')));
      const monthSeen = new Set();
      let kept = 0;
      for (const record of records) {
        const monthKey = record.statement_end ? record.statement_end.slice(0, 7) : record.src;
        if (monthSeen.has(monthKey)) continue;
        monthSeen.add(monthKey);
        statementDetails.push({
          label: record.statement_end ? MONTH_LABEL[Number(record.statement_end.slice(5, 7))] : shortSourceName(record.src, 'bank', record.statement_end, false),
          date: record.statement_end || '',
          deposits: record.deposits,
          ending: record.ending,
          withdrawals: record.withdrawals,
          bank: record.bank || '',
          account: displayAccount(record.account),
          source: record.src
        });
        kept++;
        if (kept >= 3) break;
      }
    }

    const mtdByAccount = new Map();
    for (const record of mtdRecords) {
      const key = [cleanSpace(record.bank || 'Bank'), normAcct(record.account || '') || 'unknown'].join('|');
      const current = mtdByAccount.get(key);
      if (!current || String(record.statement_end || '').localeCompare(String(current.statement_end || '')) > 0) mtdByAccount.set(key, record);
    }
    for (const record of mtdByAccount.values()) {
      statementDetails.push({
        label: 'MTD',
        date: record.statement_end || '',
        deposits: record.deposits,
        ending: record.ending,
        withdrawals: record.withdrawals,
        bank: record.bank || '',
        account: displayAccount(record.account),
        isMtd: true,
        source: record.src
      });
    }

    statementDetails.sort((a, b) => {
      if (Boolean(a.isMtd) !== Boolean(b.isMtd)) return a.isMtd ? 1 : -1;
      return String(b.date || '').localeCompare(String(a.date || '')) ||
        String(a.bank || '').localeCompare(String(b.bank || ''));
    });

    const bankAccountMap = new Map();
    for (const record of bankRecords) {
      const key = [cleanSpace(record.bank || 'Bank'), displayAccount(record.account)].join('|');
      if (!bankAccountMap.has(key)) bankAccountMap.set(key, { bank: cleanSpace(record.bank || 'Bank'), account: displayAccount(record.account) });
    }
    const bankAccounts = [...bankAccountMap.values()].filter(item => item.bank || item.account);

    const fullMcaRecords = completed.filter(record => record.statement_end && (record.mca_hits || []).some(hit => hit.verified));
    const latestMcaMonth = fullMcaRecords.map(record => String(record.statement_end).slice(0, 7)).sort().at(-1) || '';
    const mcaByName = {};
    for (const record of fullMcaRecords.filter(record => String(record.statement_end).slice(0, 7) === latestMcaMonth)) {
      for (const hit of record.mca_hits || []) {
        if (!hit.verified) continue;
        const current = mcaByName[hit.name] || { name: hit.name, count: 0, amount: null, bestCount: 0, total: 0 };
        current.count += Number(hit.count) || 0;
        current.total += Number(hit.total_amount) || ((Number(hit.amount) || 0) * (Number(hit.count) || 0));
        if (hit.amount != null && (Number(hit.count) || 0) >= current.bestCount) {
          current.amount = Number(hit.amount);
          current.bestCount = Number(hit.count) || 0;
        }
        mcaByName[hit.name] = current;
      }
    }
    const mcaDetails = Object.values(mcaByName)
      .sort((a, b) => b.total - a.total || b.count - a.count)
      .map(item => ({
        name: item.name,
        amount: item.amount,
        count: item.count,
        frequency: mcaFreq(item.count),
        monthlyTotal: Math.round(item.total)
      }));

    const newestCompleted = completed
      .filter(record => record.statement_end)
      .sort((a, b) => String(b.statement_end).localeCompare(String(a.statement_end)))[0] || null;

    let dailyCashFlow = null;
    if (newestCompleted && newestCompleted.deposits != null && newestCompleted.withdrawals != null && Number.isFinite(Number(newestCompleted.deposits)) && Number.isFinite(Number(newestCompleted.withdrawals))) {
      const date = parseDate(newestCompleted.statement_end);
      const days = date ? new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() : 30;
      dailyCashFlow = (Number(newestCompleted.deposits) - Number(newestCompleted.withdrawals)) / Math.max(1, days);
    }

    const latestEnding = bankRecords
      .filter(record => record.ending != null && Number.isFinite(Number(record.ending)))
      .sort((a, b) => String(b.statement_end || '').localeCompare(String(a.statement_end || '')))[0];

    const company = cleanCompany(app.company || group.replace(/[_-]+/g, ' ')) || group;
    const revenue = Number(app.revenue) || 0;

    rows.push({
      Company: company,
      Owner: app.owner || '',
      Revenue: revenue,
      Phones: (app.phones || []).join(' • '),
      Emails: (app.emails || []).join(' • '),
      DOB: app.dob || '',
      AppDate: app.app_date || '',
      BusinessAddress: app.business_address || app.address || '',
      ApplicationAddress: app.application_address || '',
      EIN: app.ein || '',
      BankAccounts: bankAccounts,
      MCADetails: mcaDetails,
      DailyCashFlow: dailyCashFlow,
      _sourceRevenueValue: revenue,
      _latestEnding: latestEnding && Number.isFinite(Number(latestEnding.ending)) ? Number(latestEnding.ending) : null,
      _hasEndingBalance: bankRecords.some(record => record.ending != null && Number.isFinite(Number(record.ending))),
      _statementDetails: statementDetails,
      _sources: [...new Set([app.src, ...bankRecords.map(record => record.src)].filter(Boolean))],
      _folder: group
    });
  }

  rows.sort((a, b) => (b._sourceRevenueValue || 0) - (a._sourceRevenueValue || 0) || String(a.Company || '').localeCompare(String(b.Company || '')));
  STATE.finalRows = rows;
}
