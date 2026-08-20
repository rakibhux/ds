import { useState, useEffect } from 'react';
import { 
  Search, 
  Settings, 
  Download, 
  Play, 
  Square, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FolderOpen, 
  Globe, 
  Info,
  Server,
  SearchCode
} from 'lucide-react';

interface DomainResult {
  domain: string;
  status: 'available' | 'taken' | 'unknown' | 'searching';
  source: string;
  time: string;
  error?: string;
}

const TLD_PRESETS = {
  popular: ['com', 'net', 'org', 'io', 'co', 'dev', 'app', 'sh'],
  tech: ['io', 'dev', 'app', 'ai', 'tech', 'co', 'so', 'xyz'],
  common: ['com', 'net', 'org', 'info', 'biz', 'us', 'me', 'co'],
  cctld: ['co.uk', 'com.au', 'de', 'fr', 'jp', 'ca', 'io', 'me']
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'settings'>('search');
  const [binaryPath, setBinaryPath] = useState<string>(() => {
    return localStorage.getItem('ds_binary_path') || '';
  });
  const [isBinaryValid, setIsBinaryValid] = useState<boolean>(false);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  // Search Inputs
  const [inputNames, setInputNames] = useState<string>('');
  const [selectedTlds, setSelectedTlds] = useState<string[]>(['com', 'net', 'io']);
  const [customTldInput, setCustomTldInput] = useState<string>('');
  
  // Search Options
  const [level, setLevel] = useState<'any' | 'second' | 'third'>('any');
  const [cctldOnly, setCctldOnly] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'taken' | 'unknown'>('all');
  const [sortField, setSortField] = useState<'domain' | 'status' | 'source' | 'time' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // Search Execution State
  const [searching, setSearching] = useState<boolean>(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Sync binary path to localStorage on change
  useEffect(() => {
    if (binaryPath) {
      localStorage.setItem('ds_binary_path', binaryPath);
    } else {
      localStorage.removeItem('ds_binary_path');
    }
  }, [binaryPath]);

  // Validate binary path on change, and load default if not set
  useEffect(() => {
    const initAndValidate = async () => {
      let currentPath = binaryPath;
      if (!currentPath && window.api) {
        try {
          const defaultPath = await window.api.getDefaultBinaryPath();
          if (defaultPath) {
            setBinaryPath(defaultPath);
            currentPath = defaultPath;
          }
        } catch (err) {
          console.error('Failed to get default binary path:', err);
        }
      }

      if (!currentPath || !window.api) {
        setIsBinaryValid(false);
        return;
      }

      setIsValidating(true);
      try {
        const valid = await window.api.checkBinary(currentPath);
        setIsBinaryValid(valid);
      } catch (err) {
        setIsBinaryValid(false);
      } finally {
        setIsValidating(false);
      }
    };
    initAndValidate();
  }, [binaryPath]);

  // Clean up IPC listeners on unmount
  useEffect(() => {
    return () => {
      if (window.api) {
        window.api.removeAllListeners();
      }
    };
  }, []);

  const handleSelectBinary = async () => {
    if (!window.api) return;
    try {
      const filePath = await window.api.selectBinary();
      if (filePath) {
        setBinaryPath(filePath);
      }
    } catch (err) {
      console.error('Failed to select binary:', err);
    }
  };

  const handleClearBinary = () => {
    setBinaryPath('');
    setIsBinaryValid(false);
  };

  // Toggle TLD Selection
  const toggleTld = (tld: string) => {
    setSelectedTlds(prev => {
      if (tld === 'all') {
        return ['all'];
      }
      const filtered = prev.filter(t => t !== 'all');
      return filtered.includes(tld)
        ? filtered.filter(t => t !== tld)
        : [...filtered, tld];
    });
  };

  // Apply a full preset list
  const applyTldPreset = (presetKey: keyof typeof TLD_PRESETS) => {
    setSelectedTlds(TLD_PRESETS[presetKey]);
  };

  const selectAllTlds = () => {
    setSelectedTlds(['com', 'net', 'org', 'io', 'ai', 'co', 'dev', 'app', 'sh', 'so', 'xyz', 'info', 'me', 'us']);
  };

  const selectAll1650Tlds = () => {
    setSelectedTlds(['all']);
  };

  const clearAllTlds = () => {
    setSelectedTlds([]);
  };

  const addCustomTld = () => {
    if (!customTldInput.trim()) return;
    const cleanTlds = customTldInput
      .split(/[\s,]+/)
      .map(t => t.replace(/^\.+/, '').trim().toLowerCase())
      .filter(t => t && !selectedTlds.includes(t));
    
    if (cleanTlds.length > 0) {
      setSelectedTlds(prev => [...prev, ...cleanTlds]);
      setCustomTldInput('');
    }
  };

  // Parse and build the list of domains/TLDs to search
  const parseInputs = () => {
    const names = inputNames
      .split(/[\n,]+/)
      .map(n => n.trim().toLowerCase())
      .filter(n => n.length > 0);
    
    return { names, tlds: selectedTlds };
  };

  // Cancel search
  const handleCancelSearch = () => {
    if (!searching) return;
    
    // CLI process cancellation
    if (window.api) {
      window.api.cancelSearch();
    }
    setSearching(false);
  };

  // Trigger search execution
  const handleStartSearch = () => {
    if (searching) return;
    
    const { names, tlds } = parseInputs();
    if (names.length === 0) {
      setSearchError('Please enter at least one name or domain to search.');
      return;
    }
    if (tlds.length === 0) {
      setSearchError('Please select or enter at least one TLD.');
      return;
    }

    setSearchError(null);
    setResults([]);
    setSearching(true);

    if (!isBinaryValid) {
      setSearchError('Please configure a valid Rust CLI binary path in Settings first.');
      setSearching(false);
      return;
    }
    
    runCliSearch(names, tlds);
  };

  // Real CLI Execution using IPC bridge
  const runCliSearch = (names: string[], tlds: string[]) => {
    // Collect all arguments
    const extraArgs: string[] = [];
    if (level !== 'any') {
      extraArgs.push('--level', level);
    }
    if (cctldOnly) {
      extraArgs.push('--cctld');
    }

    // Set initial searching placeholders
    const initialQueue: DomainResult[] = [];
    names.forEach(name => {
      tlds.forEach(tld => {
        initialQueue.push({
          domain: `${name}.${tld}`,
          status: 'searching',
          source: '-',
          time: '-'
        });
      });
    });
    setResults(initialQueue);

    // Setup stdout listener
    const cleanStdout = window.api.onSearchStdout((line: string) => {
      console.log('CLI STDOUT:', line);
      const parsed = parseCliLine(line);
      if (parsed) {
        setResults(prev => {
          const index = prev.findIndex(item => item.domain === parsed.domain);
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = parsed;
            return updated;
          }
          return [...prev, parsed];
        });
      }
    });

    // Setup stderr listener
    const cleanStderr = window.api.onSearchStderr((data: string) => {
      console.warn('CLI STDERR:', data);
    });

    // Setup error listener
    const cleanError = window.api.onSearchError((err: string) => {
      setSearchError(err);
      setSearching(false);
    });

    // Setup process exit listener
    const cleanExit = window.api.onSearchExit((_code: number) => {
      setSearching(false);
      // Clean up event listeners
      cleanStdout();
      cleanStderr();
      cleanError();
      cleanExit();
    });

    // Run the search
    window.api.runSearch({
      binaryPath,
      domains: names,
      tlds,
      extraArgs
    });
  };

  // Parse a line from `ds --no-color`
  const parseCliLine = (line: string): DomainResult | null => {
    const cleanLine = line.trim();
    if (cleanLine.startsWith('+')) {
      // + mybrand.io                      AVAILABLE  whois     512ms
      const parts = cleanLine.split(/\s+/);
      if (parts.length >= 5) {
        return {
          domain: parts[1],
          status: 'available',
          source: parts[3],
          time: parts[4]
        };
      }
    } else if (cleanLine.startsWith('-')) {
      // - mybrand.com                     TAKEN      rdap      504ms
      const parts = cleanLine.split(/\s+/);
      if (parts.length >= 5) {
        return {
          domain: parts[1],
          status: 'taken',
          source: parts[3],
          time: parts[4]
        };
      }
    } else if (cleanLine.startsWith('?')) {
      // ? google.pt                       UNKNOWN    -        3548ms  whois: connecting to whois.dns.pt:43: timed out
      const parts = cleanLine.split(/\s+/);
      if (parts.length >= 5) {
        const domain = parts[1];
        const source = parts[3];
        const time = parts[4];
        const errorIndex = cleanLine.indexOf(time) + time.length;
        const error = cleanLine.substring(errorIndex).trim();
        return {
          domain,
          status: 'unknown',
          source,
          time,
          error
        };
      }
    }
    return null;
  };

  // Export results to .txt files
  const handleExport = (statusFilter: 'available' | 'taken' | 'unknown' | 'all') => {
    const filtered = results.filter(r => statusFilter === 'all' || r.status === statusFilter);
    if (filtered.length === 0) return;

    const fileContent = filtered.map(r => `${r.domain} - ${r.status.toUpperCase()} (${r.source}, ${r.time})`).join('\n');
    
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `domain_search_${statusFilter}_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Stats calculation
  const stats = results.reduce(
    (acc, cur) => {
      if (cur.status === 'searching') acc.searching++;
      else if (cur.status === 'available') acc.available++;
      else if (cur.status === 'taken') acc.taken++;
      else if (cur.status === 'unknown') acc.unknown++;
      return acc;
    },
    { searching: 0, available: 0, taken: 0, unknown: 0 }
  );

  const handleSort = (field: 'domain' | 'status' | 'source' | 'time') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const displayedResults = [...results]
    .filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      
      let valA: any = a[sortField === 'time' ? 'time' : sortField];
      let valB: any = b[sortField === 'time' ? 'time' : sortField];

      // Custom numeric sorting for latency
      if (sortField === 'time') {
        const parseLatency = (t: string) => {
          if (!t || t === '-' || t === 'searching') return Infinity;
          const num = parseInt(t.replace('ms', ''), 10);
          return isNaN(num) ? Infinity : num;
        };
        const latA = parseLatency(a.time);
        const latB = parseLatency(b.time);
        return sortDirection === 'asc' ? latA - latB : latB - latA;
      }

      // Default alphabetical sorting
      valA = valA || '';
      valB = valB || '';
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Title Bar */}
      <div className="window-titlebar">
        <div className="window-titlebar-title">
          <span>🌐</span>
          <span>ds — Domain Search</span>
          <div className="window-titlebar-tag">Desktop GUI</div>
        </div>
        <div style={{ marginRight: '140px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isBinaryValid ? (
            <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }}></span>
              ACTIVE (CLI)
            </span>
          ) : (
            <span style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 'bold' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-danger)', display: 'inline-block' }}></span>
              DISCONNECTED (CLI)
            </span>
          )}
        </div>
      </div>

      <div className="app-container">
        {/* Sidebar */}
        <div className="sidebar">
          {/* Navigation */}
          <div className="sidebar-section">
            <div className="sidebar-title">Navigation</div>
            <button 
              className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <Search size={16} /> Search Workspace
            </button>
            <button 
              className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} /> App Settings
            </button>
          </div>

          {/* Quick Metrics */}
          {results.length > 0 && (
            <div className="sidebar-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <div className="sidebar-title">Active Run Metrics</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Checked</span>
                  <span style={{ fontWeight: 'bold' }}>{results.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CheckCircle2 size={12} /> Available
                  </span>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-success)' }}>{stats.available}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <XCircle size={12} /> Taken
                  </span>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-danger)' }}>{stats.taken}</span>
                </div>
                {stats.unknown > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={12} /> Unknown
                    </span>
                    <span style={{ fontWeight: 'bold', color: 'var(--color-warning)' }}>{stats.unknown}</span>
                  </div>
                )}
                {stats.searching > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-accent)' }}></span>
                      Querying...
                    </span>
                    <span style={{ fontWeight: 'bold', color: 'var(--color-accent)' }}>{stats.searching}</span>
                  </div>
                )}
              </div>

              {/* Exports */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <button 
                  className="btn" 
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                  onClick={() => handleExport('available')}
                  disabled={stats.available === 0}
                >
                  <Download size={14} /> Save Available (.txt)
                </button>
                <button 
                  className="btn" 
                  style={{ fontSize: '12px', padding: '8px 12px' }}
                  onClick={() => handleExport('all')}
                  disabled={results.length === 0}
                >
                  <Download size={14} /> Export All Results
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="main-content">
          {activeTab === 'search' ? (
            <>
              {/* Search Control Board */}
              <div className="search-container">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                  {/* Left Column: Domains Input */}
                  <div className="input-group">
                    <label className="input-label">Domain Names to Check</label>
                    <textarea 
                      className="input-field textarea-field"
                      value={inputNames}
                      onChange={(e) => setInputNames(e.target.value)}
                      placeholder="Enter brand names separated by commas or lines... e.g. google, microsoft, apple"
                      disabled={searching}
                    />
                  </div>

                  {/* Right Column: TLD Configuration */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="input-label">Select TLD Suffixes {selectedTlds.length > 0 && (selectedTlds.length === 1 && selectedTlds[0] === 'all' ? '(All 1650+ TLDs)' : `(${selectedTlds.length} selected)`)}</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => applyTldPreset('popular')} disabled={searching}>Popular</button>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => applyTldPreset('tech')} disabled={searching}>Tech</button>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => applyTldPreset('common')} disabled={searching}>Generic</button>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => applyTldPreset('cctld')} disabled={searching}>ccTLDs</button>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--color-accent)' }} onClick={selectAll1650Tlds} disabled={searching}>All (1650+)</button>
                        <span style={{ borderLeft: '1px solid var(--border-color)', margin: '0 4px' }}></span>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: 'transparent', borderColor: 'var(--border-color)' }} onClick={selectAllTlds} disabled={searching}>Select All</button>
                        <button className="btn" style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: 'transparent', borderColor: 'var(--border-color)' }} onClick={clearAllTlds} disabled={searching}>Clear</button>
                      </div>
                    </div>

                    <div className="tld-presets">
                      {Array.from(new Set([
                        ...['com', 'net', 'org', 'io', 'ai', 'co', 'dev', 'app', 'sh', 'so', 'xyz', 'info', 'me', 'us'],
                        ...selectedTlds
                      ])).map(tld => (
                        <div 
                          key={tld} 
                          className={`tld-chip ${selectedTlds.includes(tld) ? 'selected' : ''}`}
                          onClick={() => !searching && toggleTld(tld)}
                        >
                          .{tld}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        type="text" 
                        className="input-field" 
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                        placeholder="Add custom TLDs (e.g. co.uk, de)..."
                        value={customTldInput}
                        onChange={(e) => setCustomTldInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addCustomTld()}
                        disabled={searching}
                      />
                      <button className="btn" onClick={addCustomTld} disabled={searching}>Add</button>
                    </div>
                  </div>
                </div>

                {/* Advanced Search Options */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    <span className="input-label">TLD Suffix Level:</span>
                    <select 
                      className="input-field" 
                      style={{ padding: '4px 10px', width: 'auto', fontSize: '13px' }}
                      value={level} 
                      onChange={(e: any) => setLevel(e.target.value)}
                      disabled={searching}
                    >
                      <option value="any">Any (All levels)</option>
                      <option value="second">Second level (plain TLDs: .com, .de)</option>
                      <option value="third">Third level (suffixes: .co.uk, .com.au)</option>
                    </select>
                  </div>

                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={cctldOnly} 
                      onChange={(e) => setCctldOnly(e.target.checked)}
                      disabled={searching}
                    />
                    <div className="checkbox-custom"></div>
                    Country-code ccTLDs only
                  </label>

                  <div className="input-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                    <span className="input-label" style={{ marginBottom: 0 }}>Filter by Status:</span>
                    <select 
                      className="input-field" 
                      style={{ padding: '4px 10px', width: 'auto', fontSize: '13px' }}
                      value={statusFilter} 
                      onChange={(e: any) => setStatusFilter(e.target.value)}
                    >
                      <option value="all">All ({results.length})</option>
                      <option value="available">Available ({stats.available})</option>
                      <option value="taken">Taken ({stats.taken})</option>
                      <option value="unknown">Unknown ({stats.unknown})</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    {searching ? (
                      <button className="btn btn-danger" onClick={handleCancelSearch} style={{ minWidth: '150px' }}>
                        <Square size={16} /> Cancel Check
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={handleStartSearch} style={{ minWidth: '150px' }}>
                        <Play size={16} /> Check Domain
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Search Results Workspace */}
              <div className="results-container">
                {searchError && (
                  <div className="alert alert-warning" style={{ marginTop: '20px' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <div>{searchError}</div>
                  </div>
                )}

                {results.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', gap: '12px' }}>
                    <SearchCode size={48} style={{ color: 'var(--border-color)' }} />
                    <div style={{ fontSize: '15px', fontWeight: '500' }}>No active search query</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Enter names and click "Check Domain" to start streaming results.</div>
                  </div>
                ) : (
                  <>
                    <div className="results-header">
                      <div>Results Stream ({displayedResults.length} domains shown)</div>
                      {searching && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                          <span className="animate-spin" style={{ width: '12px', height: '12px', border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', display: 'inline-block' }}></span>
                          Streaming queries in real time...
                        </div>
                      )}
                    </div>

                    <div className="results-scroll">
                      <table className="results-table">
                        <thead>
                          <tr>
                            <th onClick={() => handleSort('domain')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Domain Name {sortField === 'domain' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                            </th>
                            <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Availability {sortField === 'status' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                            </th>
                            <th onClick={() => handleSort('source')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Protocol Source {sortField === 'source' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                            </th>
                            <th onClick={() => handleSort('time')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                              Latency {sortField === 'time' && (sortDirection === 'asc' ? ' ▲' : ' ▼')}
                            </th>
                            <th>Notes / Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedResults.map((row) => (
                            <tr key={row.domain} className="results-row">
                              <td className="cell-mono" style={{ fontWeight: '600' }}>{row.domain}</td>
                              <td>
                                {row.status === 'searching' ? (
                                  <span className="badge badge-searching">Checking</span>
                                ) : row.status === 'available' ? (
                                  <span className="badge badge-available">Available</span>
                                ) : row.status === 'taken' ? (
                                  <span className="badge badge-taken">Taken</span>
                                ) : (
                                  <span className="badge badge-unknown">Unknown</span>
                                )}
                              </td>
                              <td className="cell-mono" style={{ textTransform: 'uppercase', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                {row.source}
                              </td>
                              <td className="cell-mono" style={{ color: 'var(--text-secondary)' }}>
                                {row.time}
                              </td>
                              <td style={{ fontSize: '12px', color: row.status === 'unknown' ? 'var(--color-warning)' : 'var(--text-muted)' }}>
                                {row.error || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            /* Settings Panel */
            <div className="settings-container">
              <h2>Desktop GUI Preferences</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '-16px' }}>
                Configure the integration with the `ds` Rust CLI binary and network options.
              </p>

              <div className="settings-card">
                <div className="settings-card-title">Rust CLI Executable Binary Path</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '-10px' }}>
                  Specify the path to the compiled `ds` command line tool on your machine.
                </p>

                <div className="binary-path-row">
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="E.g., D:\Products ship\DS GUI Product\target\release\ds.exe" 
                    value={binaryPath}
                    onChange={(e) => setBinaryPath(e.target.value)}
                    disabled={!window.api}
                  />
                  <button className="btn" onClick={handleSelectBinary} disabled={!window.api}>
                    <FolderOpen size={16} /> Browse
                  </button>
                </div>

                {!window.api ? (
                  <div className="alert alert-warning">
                    <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Web Browser Mode:</strong> The desktop bridge is not active. System file dialogs and CLI integration are only available when running within the desktop application (Electron). The app will run in Mock Mode.
                    </div>
                  </div>
                ) : isValidating ? (
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="animate-spin" style={{ width: '12px', height: '12px', border: '2px solid transparent', borderTopColor: 'currentColor', borderRadius: '50%', display: 'inline-block' }}></span>
                    Validating binary file...
                  </div>
                ) : isBinaryValid ? (
                  <div className="alert alert-success">
                    <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Binary Connected:</strong> Found executable binary. The GUI will execute this program for all live WHOIS and RDAP checks.
                    </div>
                  </div>
                ) : (
                  <div className="alert alert-danger">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong>Binary Disconnected:</strong> No valid `ds` executable selected. The application will not be able to perform domain searches. Please select a valid executable path.
                    </div>
                  </div>
                )}
                {binaryPath && (
                  <button 
                    className="btn btn-danger" 
                    onClick={handleClearBinary}
                    style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: '12px' }}
                    disabled={!window.api}
                  >
                    Clear Path Configuration
                  </button>
                )}
              </div>

              <div className="settings-card">
                <div className="settings-card-title">WHOIS & RDAP Details</div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '-10px' }}>
                  The `ds` CLI checks domains by querying RDAP bootstrap service caches, falling back to port 43 WHOIS queries where necessary. Keep the WHOIS lookup configuration at `whois.json` in the binary root.
                </p>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-secondary)', fontSize: '13px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Server size={14} /> RDAP Bootstrap Cache: Weekly
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Globe size={14} /> Total TLD Support: 1650+
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
