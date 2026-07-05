import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Play, FolderOpen, Import, Activity, CheckCircle, XCircle, List } from 'lucide-react';
import './Dashboard.css';

interface TestStats {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

interface ExecutionSummary {
  id: string;
  timestamp: string;
  environment: string;
  stats: TestStats;
  reportPath: string;
}

declare global {
  interface Window {
    api: {
      runTests: (args: { projectPath: string; headless: boolean; env: string }) => Promise<any>;
      getHistory: () => Promise<ExecutionSummary[]>;
      openReport: (path: string) => Promise<{ success: boolean; error?: string }>;
      importSummary: () => Promise<ExecutionSummary | null>;
      importConfig: () => Promise<string[] | null>;
      onTestOutput: (callback: (output: string) => void) => () => void;
    };
  }
}

export const Dashboard: React.FC = () => {
  const [projectPath, setProjectPath] = useState('C:/'); // Default path
  const [headless, setHeadless] = useState(true);
  const [env, setEnv] = useState('staging');
  const [availableEnvs, setAvailableEnvs] = useState<string[]>([]);
  const [history, setHistory] = useState<ExecutionSummary[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');

  useEffect(() => {
    loadHistory();

    const unsubscribe = window.api.onTestOutput((output) => {
      setConsoleLogs((prev) => prev + output);
    });
    return () => unsubscribe();
  }, []);

  const loadHistory = async () => {
    try {
      const data = await window.api.getHistory();
      setHistory(data);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  const handleRunTests = async () => {
    setIsRunning(true);
    setConsoleLogs('Starting execution...\n');
    try {
      const result = await window.api.runTests({ projectPath, headless, env });
      if (result.success) {
        setConsoleLogs((prev) => prev + '\nExecution completed successfully.');
        loadHistory();
      } else {
        setConsoleLogs((prev) => prev + `\nExecution failed: ${result.error}`);
      }
    } catch (err: any) {
      setConsoleLogs((prev) => prev + `\nError running tests: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleOpenReport = async (path: string) => {
    const res = await window.api.openReport(path);
    if (!res.success) {
      alert(`Could not open report: ${res.error}`);
    }
  };

  const handleImportSummary = async () => {
    try {
      const imported = await window.api.importSummary();
      if (imported) {
        alert('Historical summary imported successfully!');
        loadHistory();
      }
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  const handleImportConfig = async () => {
    try {
      const envs = await window.api.importConfig();
      if (envs && envs.length > 0) {
        setAvailableEnvs(envs);
        if (!envs.includes(env)) {
          setEnv(envs[0]);
        }
      }
    } catch (err: any) {
      alert(`Config import failed: ${err.message}`);
    }
  };

  const chartData = history.map(item => ({
    name: new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    Passed: item.stats.passed,
    Failed: item.stats.failed,
    Total: item.stats.total
  }));

  return (
    <div className="dashboard-container">
      <div className="dashboard-wrapper">
        
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-title">
            <Activity className="icon text-emerald" size={32} />
            <div>
              <h1>TestExecutionTool</h1>
              <p>Automated Java/Selenium regression suite dashboard</p>
            </div>
          </div>
          <div className="header-tabs">
            <button 
              className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Execution History
            </button>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="overview-grid">
            
            {/* Left Column: Configuration & Actions */}
            <div className="config-column">
              
              {/* Configuration Panel */}
              <div className="panel shadow">
                <h3 className="panel-title">
                  <FolderOpen className="icon text-blue" size={20} /> Run Configuration
                </h3>
                <div className="form-group">
                  <label>Project Path</label>
                  <input 
                    type="text" 
                    value={projectPath} 
                    onChange={(e) => setProjectPath(e.target.value)} 
                    placeholder="C:/path/to/project"
                  />
                </div>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>Environment Profile</label>
                    <button 
                      onClick={handleImportConfig} 
                      className="btn-link"
                      title="Import environments from serenity.conf or properties file"
                    >
                      <Import className="icon" size={14} style={{ marginRight: '4px' }} /> Load Config
                    </button>
                  </div>
                  {availableEnvs.length > 0 ? (
                    <select 
                      value={env} 
                      onChange={(e) => setEnv(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-main)' }}
                    >
                      {availableEnvs.map((eName) => (
                        <option key={eName} value={eName}>{eName}</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      value={env} 
                      onChange={(e) => setEnv(e.target.value)} 
                    />
                  )}
                </div>
                <div className="toggle-group">
                  <span>Headless Mode</span>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={headless}
                      onChange={(e) => setHeadless(e.target.checked)}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="actions-group">
                  <button 
                    onClick={handleRunTests} 
                    disabled={isRunning}
                    className={`btn btn-primary ${isRunning ? 'disabled' : ''}`}
                  >
                    {isRunning ? (
                      <><Activity className="icon pulse" size={16} /> Executing Suite...</>
                    ) : (
                      <><Play className="icon" size={16} /> Launch Maven Run</>
                    )}
                  </button>
                  
                  <button 
                    onClick={handleImportSummary}
                    className="btn btn-secondary"
                  >
                    <Import className="icon" size={16} /> Import Historical JSON
                  </button>
                </div>
              </div>

              {/* Status Overview Card */}
              {history.length > 0 && (
                <div className="panel shadow">
                  <h3 className="panel-subtitle">Latest Run Status</h3>
                  <div className="status-grid">
                    <div className="status-box">
                      <span className="status-number text-emerald">{history[history.length-1].stats.passed}</span>
                      <span className="status-label"><CheckCircle className="icon text-emerald" size={12}/> Passed</span>
                    </div>
                    <div className="status-box">
                      <span className="status-number text-rose">{history[history.length-1].stats.failed}</span>
                      <span className="status-label"><XCircle className="icon text-rose" size={12}/> Failed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Chart & Console */}
            <div className="data-column">
              
              {/* Trends Chart */}
              <div className="panel shadow flex-fill">
                <h3 className="panel-title">
                  <Activity className="icon text-purple" size={20} /> Pass/Fail Trends
                </h3>
                {history.length > 0 ? (
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          itemStyle={{ fontSize: '14px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Line type="monotone" dataKey="Passed" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#10b981' }} />
                        <Line type="monotone" dataKey="Failed" stroke="#fb7185" strokeWidth={3} dot={{ r: 4, fill: '#fb7185', strokeWidth: 0 }} />
                        <Line type="monotone" dataKey="Total" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="empty-state">
                    No execution history available. Run a suite or import a JSON summary.
                  </div>
                )}
              </div>

              {/* Console Output */}
              <div className="panel shadow console-panel">
                <div className="console-header">
                   <h3 className="console-title">
                    <List className="icon" size={16} /> Live Console Output
                   </h3>
                   {isRunning && <span className="ping-indicator"><span></span><span></span></span>}
                </div>
                <div className="console-output">
                  {consoleLogs || <span className="text-muted italic">Awaiting execution...</span>}
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="panel shadow">
             <h3 className="panel-title">
               <FolderOpen className="icon text-amber" size={20} /> Saved Runs History
             </h3>
             <div className="table-responsive">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Environment</th>
                    <th className="text-emerald">Passed</th>
                    <th className="text-rose">Failed</th>
                    <th className="text-amber">Pending</th>
                    <th>Total</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length > 0 ? (
                    [...history].reverse().map((run) => (
                      <tr key={run.id}>
                        <td>{new Date(run.timestamp).toLocaleString()}</td>
                        <td><span className="badge">{run.environment}</span></td>
                        <td className="text-emerald font-semibold">{run.stats.passed}</td>
                        <td className="text-rose font-semibold">{run.stats.failed}</td>
                        <td className="text-amber font-semibold">{run.stats.pending}</td>
                        <td>{run.stats.total}</td>
                        <td className="text-right">
                          <button 
                            onClick={() => handleOpenReport(run.reportPath)}
                            className="btn-link"
                          >
                            Open Report
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-8 italic">No historical runs found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
             </div>
          </div>
        )}
        
      </div>
    </div>
  );
};
