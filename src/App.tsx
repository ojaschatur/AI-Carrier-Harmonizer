import React, { useState, useEffect } from 'react';
import { Settings, FileText, Upload, Download, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { readExcelData, exportHarmonization, readExcelToCsv } from './utils/excel';
import { parseCarrierData } from './utils/gemini';
import type { MappedEvent } from './utils/gemini';

type Step = 'setup' | 'upload' | 'review';

function App() {
  const [step, setStep] = useState<Step>('setup');
  
  // Setup State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('geminiApiKey') || '');
  const [carrierName, setCarrierName] = useState('s2.carrier.com');
  const [codeFormat, setCodeFormat] = useState<'concat' | 'single' | 'custom'>('concat');
  const [customCodeInstruction, setCustomCodeInstruction] = useState('');
  
  const [excelData, setExcelData] = useState<string[][]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [selectedColumnIdx, setSelectedColumnIdx] = useState<number>(0);
  const [internalEvents, setInternalEvents] = useState<string[]>([]);
  
  // Upload State
  const [carrierFile, setCarrierFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Review State
  const [mappedEvents, setMappedEvents] = useState<MappedEvent[]>([]);

  useEffect(() => {
    localStorage.setItem('geminiApiKey', apiKey);
  }, [apiKey]);

  const handleInternalEventsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { headers, rawData } = await readExcelData(file);
      setExcelHeaders(headers);
      setExcelData(rawData);
      
      // Auto-detect a column that looks like 'code' or 'event'
      const codeIdx = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('code') || lower.includes('event');
      });
      setSelectedColumnIdx(codeIdx >= 0 ? codeIdx : 0);
    } catch (err) {
      console.error(err);
      setError('Failed to parse internal events Excel file.');
    }
  };

  // Recompute internal events when data or column selection changes
  useEffect(() => {
    if (excelData.length > 0 && selectedColumnIdx >= 0) {
      const events: string[] = [];
      for (const row of excelData) {
        if (row.length > selectedColumnIdx && row[selectedColumnIdx]) {
          events.push(row[selectedColumnIdx]);
        }
      }
      setInternalEvents(Array.from(new Set(events)).filter(Boolean));
    } else {
      setInternalEvents([]);
    }
  }, [excelData, selectedColumnIdx]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (base64) resolve(base64);
        else reject(new Error('Failed to convert to base64'));
      };
      reader.onerror = error => reject(error);
    });
  };

  const handlePdfUploadAndParse = async () => {
    if (!carrierFile || !apiKey || internalEvents.length === 0 || !carrierName) return;
    
    setIsParsing(true);
    setProgressMsg('Preparing file...');
    setError(null);
    
    try {
      const isPdf = carrierFile.name.toLowerCase().endsWith('.pdf');
      
      if (isPdf) {
        setProgressMsg('Uploading PDF to Gemini...');
        const documentData = await fileToBase64(carrierFile);
        const results = await parseCarrierData(apiKey, documentData, isPdf, codeFormat, internalEvents, customCodeInstruction);
        setMappedEvents(results);
      } else {
        setProgressMsg('Reading Excel/CSV data...');
        const documentData = await readExcelToCsv(carrierFile);
        
        // Auto-chunking for tabular data to bypass AI token limits
        const lines = documentData.split('\n');
        const header = lines[0] || '';
        const dataLines = lines.slice(1).filter(l => l.trim().length > 0);
        
        const CHUNK_SIZE = 100;
        const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);
        
        let allResults: MappedEvent[] = [];
        
        for (let i = 0; i < totalChunks; i++) {
          setProgressMsg(`Parsing chunk ${i + 1} of ${totalChunks}...`);
          const chunkLines = dataLines.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          const chunkData = [header, ...chunkLines].join('\n');
          
          const chunkResults = await parseCarrierData(apiKey, chunkData, isPdf, codeFormat, internalEvents, customCodeInstruction);
          allResults = [...allResults, ...chunkResults];
        }
        
        setMappedEvents(allResults);
      }

      setStep('review');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to parse file with Gemini. Please check your API key or wait a moment if rate limited.');
    } finally {
      setIsParsing(false);
      setProgressMsg('');
    }
  };

  const handleExport = () => {
    exportHarmonization(mappedEvents, carrierName, `${carrierName.split('.')[1]}_harmonization.xlsx`);
  };

  const updateMapping = (index: number, field: keyof MappedEvent, value: string) => {
    const newEvents = [...mappedEvents];
    newEvents[index] = { ...newEvents[index], [field]: value };
    setMappedEvents(newEvents);
  };

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '8px', background: 'linear-gradient(to right, #6366f1, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          AI Carrier Harmonizer
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>Map any carrier tracking PDF to your internal events using Gemini AI.</p>
      </header>

      {/* Stepper */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', left: 0, right: 0, height: '2px', background: 'var(--border-color)', zIndex: -1, transform: 'translateY(-50%)' }}></div>
        {(['setup', 'upload', 'review'] as Step[]).map((s, i) => (
          <div key={s} style={{ 
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            background: 'transparent', padding: '0 16px'
          }}>
            <div style={{ 
              width: '32px', height: '32px', borderRadius: '50%', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: step === s || (step === 'review' && i < 2) || (step === 'upload' && i === 0) ? 'var(--primary)' : 'var(--bg-color)',
              color: 'white', fontWeight: 'bold', border: '1px solid var(--border-color)'
            }}>
              {i + 1}
            </div>
            <span style={{ textTransform: 'capitalize', fontSize: '14px', color: step === s ? 'var(--text-main)' : 'var(--text-muted)' }}>{s}</span>
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', padding: '16px', borderRadius: '8px', color: '#fca5a5', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* SETUP STEP */}
      {step === 'setup' && (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={24} className="text-primary" /> Configuration
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Gemini API Key</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="AIzaSy..." 
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Required to parse PDF formats. Saved locally in your browser.</p>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Internal Events Excel (.xlsx)</label>
              <input 
                type="file" 
                accept=".xlsx"
                className="input-field" 
                onChange={handleInternalEventsUpload}
                style={{ padding: '8px' }}
              />
              
              {excelHeaders.length > 0 && (
                <div style={{ marginTop: '12px', background: 'rgba(99, 102, 241, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>Select Column Containing Events</label>
                  <select 
                    className="input-field"
                    value={selectedColumnIdx}
                    onChange={e => setSelectedColumnIdx(Number(e.target.value))}
                    style={{ padding: '6px', fontSize: '13px' }}
                  >
                    {excelHeaders.map((header, idx) => (
                      <option key={idx} value={idx}>{header}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '12px', color: 'var(--success)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={14} /> Loaded {internalEvents.length} internal events.
                  </p>
                </div>
              )}
            </div>

            <button 
              className="btn-primary" 
              style={{ marginTop: '16px' }}
              onClick={() => setStep('upload')}
              disabled={!apiKey || internalEvents.length === 0}
            >
              Next Step
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD STEP */}
      {step === 'upload' && (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <FileText size={24} className="text-primary" /> Upload Carrier Data
          </h2>
          
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Carrier Identifier</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="s2.chezvous.fr" 
                value={carrierName}
                onChange={e => setCarrierName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>Expected Code Format</label>
              <select 
                className="input-field"
                value={codeFormat}
                onChange={e => setCodeFormat(e.target.value as any)}
              >
                <option value="concat">Concatenate codes (e.g. Code1 + Code2 = AARCFM)</option>
                <option value="single">Single code provided</option>
                <option value="custom">Custom Instruction</option>
              </select>
              {codeFormat === 'custom' && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 500 }}>Custom Extraction Instruction</label>
                  <textarea 
                    className="input-field"
                    placeholder="e.g. 'There are two code columns. Only extract the first column and ignore the second.'"
                    value={customCodeInstruction}
                    onChange={e => setCustomCodeInstruction(e.target.value)}
                    rows={2}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              )}
            </div>
          </div>
          
          <label style={{ 
            display: 'block', border: '2px dashed var(--border-color)', borderRadius: '16px', 
            padding: '60px 20px', cursor: 'pointer', transition: 'all 0.2s',
            background: carrierFile ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
            borderColor: carrierFile ? 'var(--primary)' : 'var(--border-color)'
          }}>
            <input 
              type="file" 
              accept=".pdf,.xlsx,.xls,.csv" 
              style={{ display: 'none' }}
              onChange={e => setCarrierFile(e.target.files?.[0] || null)}
            />
            <Upload size={48} style={{ margin: '0 auto 16px', color: carrierFile ? 'var(--primary)' : 'var(--text-muted)' }} />
            <p style={{ fontSize: '18px', fontWeight: 500, marginBottom: '8px' }}>
              {carrierFile ? carrierFile.name : 'Click to upload or drag and drop'}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
              Upload the PDF or Excel/CSV file containing the carrier's tracking codes.
            </p>
          </label>

          <div style={{ display: 'flex', gap: '16px', marginTop: '32px', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => setStep('setup')}>Back</button>
            <button 
              className="btn-primary" 
              onClick={handlePdfUploadAndParse}
              disabled={!carrierFile || !carrierName || isParsing}
            >
              {isParsing ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Parsing with AI...
                  </div>
                  {progressMsg && <span style={{ fontSize: '11px', fontWeight: 'normal', opacity: 0.8 }}>{progressMsg}</span>}
                </div>
              ) : (
                'Parse and Map Events'
              )}
            </button>
          </div>
        </div>
      )}

      {/* REVIEW STEP */}
      {step === 'review' && (
        <div className="glass-panel animate-fade-in">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <CheckCircle2 size={24} style={{ color: 'var(--success)' }} /> Review Mappings
              </h2>
              <p style={{ color: 'var(--text-muted)' }}>{mappedEvents.length} events extracted. Please review and adjust any incorrect mappings.</p>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button className="btn-secondary" onClick={() => setStep('upload')}>Back</button>
              <button className="btn-primary" onClick={handleExport}>
                <Download size={18} /> Export Harmonization Excel
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Code</th>
                  <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Description</th>
                  <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Internal Event</th>
                  <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>Internal Return Event</th>
                  <th style={{ padding: '12px', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center' }}>AI Confidence</th>
                </tr>
              </thead>
              <tbody>
                {mappedEvents.map((event, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.1)', transition: 'background 0.2s' }}>
                    <td style={{ padding: '12px', fontWeight: 500 }}>{event.code}</td>
                    <td style={{ padding: '12px', maxWidth: '300px' }}>{event.description}</td>
                    <td style={{ padding: '12px' }}>
                      <select 
                        className="input-field" 
                        value={event.internalEvent}
                        onChange={(e) => updateMapping(idx, 'internalEvent', e.target.value)}
                        style={{ padding: '6px', fontSize: '13px' }}
                      >
                        <option value="">-- Select Event --</option>
                        {internalEvents.map(ie => (
                          <option key={ie} value={ie}>{ie}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <select 
                        className="input-field" 
                        value={event.internalReturnEvent}
                        onChange={(e) => updateMapping(idx, 'internalReturnEvent', e.target.value)}
                        style={{ padding: '6px', fontSize: '13px' }}
                      >
                        <option value="">-- Select Event --</option>
                        {internalEvents.map(ie => (
                          <option key={ie} value={ie}>{ie}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{ 
                        display: 'inline-block', width: '12px', height: '12px', borderRadius: '50%',
                        background: event.confidence === 'high' ? 'var(--success)' : 
                                    event.confidence === 'medium' ? 'var(--warning)' : 'var(--danger)'
                      }} title={event.confidence}></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
