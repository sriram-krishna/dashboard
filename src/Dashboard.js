import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ComposedChart } from 'recharts';

// ============= UTILITY FUNCTIONS =============
const DataUtils = {
  parseCSV: (csvText) => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    return lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.replace(/"/g, '').trim());
      const row = {};
      headers.forEach((header, i) => {
        row[header] = values[i];
      });
      return row;
    });
  },

  processByDay: (data) => {
    const dayData = {};
    
    data.forEach(row => {
      const date = new Date(row.Time);
      const dayKey = date.toISOString().split('T')[0];
      
      if (!dayData[dayKey]) {
        dayData[dayKey] = [];
      }
      
      dayData[dayKey].push({
        time: row.Time,
        timestamp: date,
        deviceId: row.deviceId,
        measure: row.measure_name,
        value: parseFloat(row.measure_value) || 0
      });
    });
    
    return dayData;
  },

  getCycleCountByDay: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const cycles = processedData[day].filter(d => d.measure === 'cycle.durationS');
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: day,
        count: cycles.length
      };
    });
  },

  getEnergyByDay: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const energyMetrics = processedData[day].filter(d => d.measure === 'energy.totalWh');
      const perHour = processedData[day].filter(d => d.measure === 'energy.perHourWh');
      const total = energyMetrics.reduce((sum, m) => sum + m.value, 0);
      const avgPerHour = perHour.length ? perHour.reduce((sum, m) => sum + m.value, 0) / perHour.length : 0;
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total,
        perHour: avgPerHour
      };
    });
  },

  getVoltageByDay: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const u1 = processedData[day].filter(d => d.measure === 'voltage.U1');
      const u2 = processedData[day].filter(d => d.measure === 'voltage.U2');
      const u3 = processedData[day].filter(d => d.measure === 'voltage.U3');
      
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        phase1: u1.length ? u1.reduce((sum, m) => sum + m.value, 0) / u1.length : 0,
        phase2: u2.length ? u2.reduce((sum, m) => sum + m.value, 0) / u2.length : 0,
        phase3: u3.length ? u3.reduce((sum, m) => sum + m.value, 0) / u3.length : 0
      };
    });
  },

  getCurrentByDay: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const inrushMax = processedData[day].filter(d => d.measure === 'inrush.maxPeakA');
      const inrushMean = processedData[day].filter(d => d.measure === 'inrush.meanPeakA');
      const workCurrent = processedData[day].filter(d => d.measure === 'workCurrent.meanAvgA');
      
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        inrushMax: inrushMax.length ? inrushMax.reduce((sum, m) => sum + m.value, 0) / inrushMax.length : 0,
        inrushMean: inrushMean.length ? inrushMean.reduce((sum, m) => sum + m.value, 0) / inrushMean.length : 0,
        workCurrent: workCurrent.length ? workCurrent.reduce((sum, m) => sum + m.value, 0) / workCurrent.length : 0
      };
    });
  },

  getRuntimeByDay: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const durations = processedData[day].filter(d => d.measure === 'cycle.durationS');
      const totalRuntime = durations.reduce((sum, d) => sum + d.value, 0);
      const avgDuration = durations.length ? totalRuntime / durations.length : 0;
      
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        runtime: totalRuntime / 60,
        cycles: durations.length,
        avgDuration
      };
    });
  },

  calculateUtilization: (processedData) => {
    const allCycles = Object.values(processedData).flat().filter(d => d.measure === 'cycle.durationS');
    const totalCycles = allCycles.length;
    
    const optimalCyclesPerDay = (8 * 60) / 2;
    const days = Object.keys(processedData).length || 1;
    const actualCyclesPerDay = totalCycles / days;
    const utilization = Math.min((actualCyclesPerDay / optimalCyclesPerDay) * 100, 100);
    
    return Math.round(utilization);
  },

  calculateChamberFullness: (processedData) => {
    const allCycles = Object.values(processedData).flat().filter(d => d.measure === 'cycle.durationS');
    const days = Object.keys(processedData).length || 1;
    const cyclesPerDay = allCycles.length / days;
    
    const low = Math.max(0, Math.min(30, (50 - cyclesPerDay) / 50 * 30));
    const medium = cyclesPerDay < 50 ? 0 : Math.min(40, (cyclesPerDay - 50) / 100 * 40);
    const high = cyclesPerDay < 150 ? 0 : Math.min(100, (cyclesPerDay - 150) / 100 * 100);
    
    const total = low + medium + high;
    return {
      low: total > 0 ? Math.round((low / total) * 100) : 30,
      medium: total > 0 ? Math.round((medium / total) * 100) : 40,
      high: total > 0 ? Math.round((high / total) * 100) : 30
    };
  },

  detectAnomalies: (processedData) => {
    const anomalies = [];
    
    Object.keys(processedData).forEach(day => {
      const data = processedData[day];
      
      const voltages = data.filter(d => d.measure.startsWith('voltage.U'));
      voltages.forEach(v => {
        if (v.value < 110 || v.value > 125) {
          anomalies.push({
            date: day,
            type: 'Voltage Anomaly',
            severity: v.value < 105 || v.value > 130 ? 'critical' : 'warning',
            value: v.value,
            measure: v.measure
          });
        }
      });
      
      const temps = data.filter(d => d.measure === 'temperature.ambient');
      temps.forEach(t => {
        if (t.value > 35) {
          anomalies.push({
            date: day,
            type: 'Temperature Anomaly',
            severity: t.value > 40 ? 'critical' : 'warning',
            value: t.value
          });
        }
      });
      
      const inrush = data.filter(d => d.measure === 'inrush.maxPeakA');
      inrush.forEach(i => {
        if (i.value > 40) {
          anomalies.push({
            date: day,
            type: 'Inrush Current Anomaly',
            severity: i.value > 45 ? 'critical' : 'warning',
            value: i.value
          });
        }
      });
      
      const errors = data.filter(d => d.measure === 'DI8_Full_Error' && d.value === 1);
      if (errors.length > 0) {
        anomalies.push({
          date: day,
          type: 'Error State',
          severity: 'critical',
          count: errors.length
        });
      }
    });
    
    return anomalies;
  },

  getAnomalyBreakdown: (processedData) => {
    const anomalies = DataUtils.detectAnomalies(processedData);
    const byDay = {};
    
    anomalies.forEach(a => {
      const dayKey = new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!byDay[dayKey]) {
        byDay[dayKey] = { day: dayKey, voltage: 0, temperature: 0, current: 0, error: 0 };
      }
      
      if (a.type.includes('Voltage')) byDay[dayKey].voltage++;
      else if (a.type.includes('Temperature')) byDay[dayKey].temperature++;
      else if (a.type.includes('Current')) byDay[dayKey].current++;
      else if (a.type.includes('Error')) byDay[dayKey].error++;
    });
    
    return Object.values(byDay);
  },

  calculateDowntime: (processedData) => {
    return Object.keys(processedData).sort().map(day => {
      const data = processedData[day];
      
      const kmStates = data.filter(d => d.measure === 'DI1_KM').sort((a, b) => a.timestamp - b.timestamp);
      
      let downMinutes = 0;
      for (let i = 1; i < kmStates.length; i++) {
        if (kmStates[i].value === 0) {
          const timeDiff = (kmStates[i].timestamp - kmStates[i-1].timestamp) / 1000 / 60;
          downMinutes += timeDiff;
        }
      }
      
      return {
        day: new Date(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        downtime: downMinutes
      };
    });
  },

  calculateSafetyMetrics: (processedData) => {
    let eStops = 0;
    let cycleErrors = 0;
    let gateViolations = 0;
    
    Object.values(processedData).flat().forEach(d => {
      if (d.measure === 'DI2_ES_Overload_Key' && d.value === 1) eStops++;
      if (d.measure === 'DI8_Full_Error' && d.value === 1) cycleErrors++;
      if (d.measure === 'DI3_Gate' && d.value === 0) gateViolations++;
    });
    
    return { eStops, cycleErrors, gateViolations };
  },

  getDigitalInputTimeline: (processedData) => {
    const events = [];
    
    Object.keys(processedData).sort().slice(-3).forEach(day => {
      const data = processedData[day];
      
      const eStops = data.filter(d => d.measure === 'DI2_ES_Overload_Key' && d.value === 1);
      const errors = data.filter(d => d.measure === 'DI8_Full_Error' && d.value === 1);
      const gates = data.filter(d => d.measure === 'DI5_GateDown' && d.value === 1);
      
      eStops.forEach(e => events.push({ type: 'Overload', time: e.time, status: 'error' }));
      errors.forEach(e => events.push({ type: 'Full Error', time: e.time, status: 'error' }));
      gates.forEach(e => events.push({ type: 'Gate Down', time: e.time, status: 'success' }));
    });
    
    return events.slice(-5);
  },

  calculateMTBF: (processedData) => {
    const allData = Object.values(processedData).flat();
    const errors = allData.filter(d => d.measure === 'DI8_Full_Error' && d.value === 1);
    const cycles = allData.filter(d => d.measure === 'cycle.durationS');
    
    return errors.length > 0 ? Math.round(cycles.length / errors.length) : cycles.length;
  },

  calculateMTTR: (processedData) => {
    const allData = Object.values(processedData).flat().sort((a, b) => a.timestamp - b.timestamp);
    const errors = allData.filter(d => d.measure === 'DI8_Full_Error');
    
    let totalRepairTime = 0;
    let repairCount = 0;
    
    for (let i = 1; i < errors.length; i++) {
      if (errors[i-1].value === 1 && errors[i].value === 0) {
        const repairTime = (errors[i].timestamp - errors[i-1].timestamp) / 1000 / 60;
        totalRepairTime += repairTime;
        repairCount++;
      }
    }
    
    return repairCount > 0 ? Math.round(totalRepairTime / repairCount) : 20;
  },

  getUtilizationHeatmap: (processedData) => {
    const heatmap = {};
    
    Object.values(processedData).flat().forEach(d => {
      if (d.measure === 'cycle.durationS') {
        const date = new Date(d.time);
        const day = date.getDay();
        const hour = date.getHours();
        const key = `${day}-${hour}`;
        
        if (!heatmap[key]) heatmap[key] = 0;
        heatmap[key]++;
      }
    });
    
    return heatmap;
  }
};

// ============= COMPONENTS =============
const GaugeChart = ({ value, label }) => {
  const percentage = (value / 100) * 100;
  
  return (
    <div className="text-center">
      <div className="relative w-32 h-20 mx-auto">
        <svg width="120" height="80" viewBox="0 0 120 80">
          <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke="#e0e0e0" strokeWidth="12" />
          <path d="M 10 70 A 50 50 0 0 1 110 70" fill="none" stroke="#4caf50" strokeWidth="12" strokeDasharray={`${(percentage / 100) * 157} 157`} />
          <text x="60" y="50" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#333">
            {Math.round(value)}%
          </text>
        </svg>
      </div>
      <div className="mt-2 text-sm text-gray-500">{label}</div>
      <div className="flex justify-center gap-1 mt-1 text-xs">
        <span className="text-gray-400">Low</span>
        <span className="text-gray-600">High</span>
      </div>
    </div>
  );
};

const CylinderChart = ({ low, medium, high, label }) => {
  const total = low + medium + high;
  const lowPct = (low / total) * 100;
  const mediumPct = (medium / total) * 100;
  const highPct = (high / total) * 100;
  
  return (
    <div className="text-center">
      <div className="flex justify-center gap-2 mb-2 text-xs">
        <span className="px-2 py-1 bg-red-500 text-white rounded">Low</span>
        <span className="px-2 py-1 bg-yellow-400 text-white rounded">Med</span>
        <span className="px-2 py-1 bg-green-500 text-white rounded">High</span>
      </div>
      <div className="text-sm font-semibold mb-2">{label}</div>
      <svg width="80" height="120" viewBox="0 0 80 120" className="mx-auto">
        <ellipse cx="40" cy="110" rx="30" ry="8" fill="#ddd" />
        <rect x="10" y="20" width="60" height="90" fill="#f5f5f5" stroke="#999" strokeWidth="1" />
        {lowPct > 0 && <rect x="10" y={110 - lowPct * 0.9} width="60" height={lowPct * 0.9} fill="#dc3545" />}
        {mediumPct > 0 && <rect x="10" y={110 - lowPct * 0.9 - mediumPct * 0.9} width="60" height={mediumPct * 0.9} fill="#ffc107" />}
        {highPct > 0 && <rect x="10" y={20} width="60" height={highPct * 0.9} fill="#28a745" />}
        <ellipse cx="40" cy="20" rx="30" ry="8" fill="none" stroke="#999" strokeWidth="1" />
        <text x="40" y="60" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#333">{high}%</text>
      </svg>
    </div>
  );
};

const HeatmapChart = ({ title, heatmapData }) => {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const getColor = (day, hour) => {
    const key = `${day}-${hour}`;
    const value = heatmapData[key] || 0;
    
    if (value === 0) return '#f5f5f5';
    if (value > 10) return '#28a745';
    if (value > 5) return '#ffc107';
    if (value > 2) return '#fd7e14';
    return '#dc3545';
  };
  
  return (
    <div>
      <h6 className="text-sm font-semibold text-gray-600 mb-3">{title}</h6>
      <div className="flex items-center text-xs mb-2">
        <span className="px-2 py-1 bg-green-500 text-white rounded mr-2">High (10+)</span>
        <span className="px-2 py-1 bg-yellow-400 text-white rounded mr-2">Medium (5-10)</span>
        <span className="px-2 py-1 bg-red-500 text-white rounded">Low (2-5)</span>
      </div>
      <div className="overflow-x-auto">
        <svg width="600" height="200" viewBox="0 0 600 200">
          {days.map((day, dayIdx) => (
            <text key={day} x="30" y={dayIdx * 25 + 35} fontSize="10" textAnchor="end">{day}</text>
          ))}
          {hours.map((hour, hourIdx) => {
            if (hourIdx % 2 === 0) {
              return <text key={hour} x={hourIdx * 24 + 60} y="15" fontSize="9" textAnchor="middle">{hour.toString().padStart(2, '0')}</text>;
            }
            return null;
          })}
          {days.map((day, dayIdx) => 
            hours.map((hour, hourIdx) => (
              <rect
                key={`${day}-${hour}`}
                x={hourIdx * 24 + 48}
                y={dayIdx * 25 + 20}
                width="22"
                height="22"
                fill={getColor(dayIdx, hour)}
                stroke="#fff"
                strokeWidth="2"
              />
            ))
          )}
        </svg>
      </div>
    </div>
  );
};

const FileUploader = ({ onFileLoad, isLoading }) => {
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      onFileLoad(event.target.result);
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-8 text-center mb-6">
      <div className="mb-4">
        <svg className="mx-auto h-12 w-12 text-blue-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <label htmlFor="file-upload" className="cursor-pointer">
        <span className="mt-2 block text-sm font-medium text-gray-900">
          {isLoading ? 'Loading data...' : 'Upload CSV File (test_data.csv)'}
        </span>
        <input
          id="file-upload"
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
          disabled={isLoading}
        />
        <span className="mt-1 block text-xs text-gray-500">
          Click to browse or drag and drop
        </span>
      </label>
    </div>
  );
};

// ============= MAIN DASHBOARD =============
export default function Dashboard() {
  const [csvData, setCsvData] = useState(null);
  const [processedData, setProcessedData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    totalCycles: 0,
    utilization: 0,
    avgCycleCount: 0,
    deviceId: 'N/A',
    chamberFullness: { low: 30, medium: 40, high: 30 },
    anomalyCount: 0,
    eStops: 0,
    cycleErrors: 0,
    gateViolations: 0,
    mtbf: 0,
    mttr: 0
  });

  const handleFileLoad = (content) => {
    setIsLoading(true);
    try {
      const parsed = DataUtils.parseCSV(content);
      setCsvData(parsed);
      
      const byDay = DataUtils.processByDay(parsed);
      setProcessedData(byDay);
      
      const totalCycles = Object.values(byDay).flat().filter(d => d.measure === 'cycle.durationS').length;
      const utilization = DataUtils.calculateUtilization(byDay);
      const days = Object.keys(byDay).length || 1;
      const deviceId = parsed[0]?.deviceId || 'N/A';
      const chamberFullness = DataUtils.calculateChamberFullness(byDay);
      const anomalies = DataUtils.detectAnomalies(byDay);
      const safetyMetrics = DataUtils.calculateSafetyMetrics(byDay);
      const mtbf = DataUtils.calculateMTBF(byDay);
      const mttr = DataUtils.calculateMTTR(byDay);
      
      setStats({
        totalCycles,
        utilization,
        avgCycleCount: Math.round(totalCycles / days),
        deviceId,
        chamberFullness,
        anomalyCount: anomalies.length,
        ...safetyMetrics,
        mtbf,
        mttr
      });
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error processing CSV:', error);
      setIsLoading(false);
      alert('Error processing CSV file. Please check the file format.');
    }
  };

  const cycleCountData = csvData ? DataUtils.getCycleCountByDay(processedData) : [];
  const energyData = csvData ? DataUtils.getEnergyByDay(processedData) : [];
  const voltageData = csvData ? DataUtils.getVoltageByDay(processedData) : [];
  const currentData = csvData ? DataUtils.getCurrentByDay(processedData) : [];
  const runtimeData = csvData ? DataUtils.getRuntimeByDay(processedData) : [];
  const anomalyBreakdown = csvData ? DataUtils.getAnomalyBreakdown(processedData) : [];
  const recentAnomalies = csvData ? DataUtils.detectAnomalies(processedData).slice(-5) : [];
  const downtimeData = csvData ? DataUtils.calculateDowntime(processedData) : [];
  const digitalInputEvents = csvData ? DataUtils.getDigitalInputTimeline(processedData) : [];
  const heatmapData = csvData ? DataUtils.getUtilizationHeatmap(processedData) : {};

  const sections = [
    { id: 'performance', icon: '📊', label: 'Performance' },
    { id: 'electrical', icon: '⚡', label: 'Electrical Health' },
    { id: 'utilization', icon: '📈', label: 'Utilization' },
    { id: 'energy', icon: '💡', label: 'Energy Management' },
    { id: 'anomaly', icon: '⚠️', label: 'Anomaly Detection' },
    { id: 'safety', icon: '🛡️', label: 'Safety & Reliability' },
    { id: 'eol', icon: '📅', label: 'EOL Planning' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-red-600 rounded mr-3 flex items-center justify-center text-white font-bold text-xl">K</div>
            <span className="text-2xl font-bold text-red-700">Komar</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Hey limanyel!</span>
            <div className="w-10 h-10 bg-blue-500 rounded-full"></div>
          </div>
        </div>
      </nav>

      <div className="flex">
        <div className="w-56 bg-white min-h-screen shadow-sm">
          <nav className="py-4">
            {sections.map(item => (
              <div key={item.id} className="px-6 py-3 flex items-center gap-3 border-l-4 border-transparent">
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm">{item.label}</span>
              </div>
            ))}
          </nav>
        </div>

        <div className="flex-1 p-6">
          {!csvData && <FileUploader onFileLoad={handleFileLoad} isLoading={isLoading} />}

          {csvData && (
            <>
              <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Region/ Site</label>
                    <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                      <option>Select</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Device</label>
                    <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                      <option>{stats.deviceId}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Time Period</label>
                    <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                      <option>Last 7 Days</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <span className="text-xs text-gray-500">Data loaded: {Object.keys(processedData).length} days</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">📊 Performance</h2>
                </div>
                
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-6 mb-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Utilization Rate</h6>
                      <div className="flex items-center text-xs mb-3 justify-center gap-2">
                        <span className="px-2 py-1 bg-red-500 text-white rounded">Low</span>
                        <span className="px-2 py-1 bg-yellow-400 text-white rounded">Med</span>
                        <span className="px-2 py-1 bg-green-500 text-white rounded">High</span>
                      </div>
                      <GaugeChart value={stats.utilization} label={stats.deviceId} />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Chamber Fullness Estimate</h6>
                      <CylinderChart 
                        low={stats.chamberFullness.low} 
                        medium={stats.chamberFullness.medium} 
                        high={stats.chamberFullness.high} 
                        label={stats.deviceId} 
                      />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Total Cycle Count</h6>
                      <div className="text-center mb-3">
                        <div className="text-5xl font-bold">{stats.totalCycles}</div>
                      </div>
                      <ResponsiveContainer width="100%" height={80}>
                        <BarChart data={cycleCountData}>
                          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="text-center mt-4">
                        <h6 className="text-xs text-gray-500 mb-2">Avg Cycle Count / Day</h6>
                        <div className="text-2xl font-bold">{stats.avgCycleCount}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Total Runtime Vs Cycle Duration</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <ComposedChart data={runtimeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis yAxisId="left" style={{ fontSize: '10px' }} />
                          <YAxis yAxisId="right" orientation="right" style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="left" dataKey="runtime" fill="#fbbf24" name="Runtime (min)" />
                          <Line yAxisId="right" type="monotone" dataKey="avgDuration" stroke="#6366f1" strokeWidth={2} name="Avg Cycle (s)" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Cycle Count by Day</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={cycleCountData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#ec4899" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Cycle Performance</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={runtimeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="cycles" stroke="#8b5cf6" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Down Periods (minutes)</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={downtimeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Bar dataKey="downtime" fill="#fbbf24" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">⚡ Electrical Health</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Current Inrush</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={currentData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="inrushMax" fill="#ec4899" name="Peak Inrush (A)" />
                          <Bar dataKey="inrushMean" fill="#8b5cf6" name="Mean Inrush (A)" />
                          <Bar dataKey="workCurrent" fill="#3b82f6" name="Work Current (A)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Voltage Quality (3-Phase)</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={voltageData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis domain={[100, 130]} style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="phase1" stroke="#3b82f6" strokeWidth={2} name="Phase 1 (V)" />
                          <Line type="monotone" dataKey="phase2" stroke="#8b5cf6" strokeWidth={2} name="Phase 2 (V)" />
                          <Line type="monotone" dataKey="phase3" stroke="#fbbf24" strokeWidth={2} name="Phase 3 (V)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">📈 Utilization</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <HeatmapChart title="Utilization Matrix (Hourly × Daily)" heatmapData={heatmapData} />
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Active Time</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <AreaChart data={runtimeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="runtime" stackId="1" stroke="#8b5cf6" fill="#ddd6fe" name="Active" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">💡 Energy Management</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Energy Efficiency by Day</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={energyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Energy (Wh)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Energy per Hour Trend</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={energyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="perHour" stroke="#fbbf24" strokeWidth={2} name="Wh/Hour" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">⚠️ Anomaly Detection</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Anomaly Detection Status</h6>
                      <div className="text-center py-4">
                        <div className="text-5xl font-bold text-yellow-500 mb-2">{stats.anomalyCount}</div>
                        <div className="text-sm text-gray-500">Total Anomalies Detected</div>
                      </div>
                      <div className="mt-4 text-xs space-y-2">
                        <div className="flex justify-between">
                          <span>Critical:</span>
                          <span className="font-bold text-red-500">{recentAnomalies.filter(a => a.severity === 'critical').length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Warnings:</span>
                          <span className="font-bold text-yellow-500">{recentAnomalies.filter(a => a.severity === 'warning').length}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Anomaly Breakdown by Day</h6>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={anomalyBreakdown}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="voltage" stackId="a" fill="#ec4899" name="Voltage" />
                          <Bar dataKey="temperature" stackId="a" fill="#fbbf24" name="Temperature" />
                          <Bar dataKey="current" stackId="a" fill="#8b5cf6" name="Current" />
                          <Bar dataKey="error" stackId="a" fill="#ef4444" name="Error" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Recent Anomalies</h6>
                      <div className="space-y-2">
                        {recentAnomalies.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 border border-gray-200 rounded text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-white font-bold ${item.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-400'}`}>!</span>
                              <span>{item.type}</span>
                            </div>
                            <span className="text-gray-500">{new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          </div>
                        ))}
                        {recentAnomalies.length === 0 && (
                          <div className="text-center text-gray-500 py-8">No anomalies detected</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">🛡️ Safety & Reliability</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-4 gap-6 mb-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">E-Stop Activations</h6>
                      <div className="text-4xl font-bold">{stats.eStops}</div>
                      <div className="text-xs text-gray-500 mt-2">{stats.deviceId}</div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Cycle Errors</h6>
                      <div className="text-4xl font-bold">{stats.cycleErrors}</div>
                      <div className="text-xs text-gray-500 mt-2">{stats.deviceId}</div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Gate Violations</h6>
                      <div className="text-4xl font-bold">{stats.gateViolations}</div>
                      <div className="text-xs text-gray-500 mt-2">{stats.deviceId}</div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Digital Input Timeline</h6>
                      <div className="space-y-2 text-xs max-h-40 overflow-y-auto">
                        {digitalInputEvents.map((event, idx) => (
                          <div key={idx} className="p-2 border border-gray-200 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold">{event.type}</span>
                              <span className={`w-2 h-2 rounded-full ${event.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            </div>
                            <div className="text-gray-500 text-xs">
                              {new Date(event.time).toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">MTBF (Mean Time Between Failures)</h6>
                      <div className="text-4xl font-bold">{stats.mtbf}</div>
                      <div className="text-xs text-gray-500 mt-2">Cycles</div>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">MTTR (Mean Time To Repair)</h6>
                      <div className="text-4xl font-bold">{stats.mttr}</div>
                      <div className="text-xs text-gray-500 mt-2">Minutes</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-l-4 border-yellow-400 px-6 py-4 bg-yellow-50">
                  <h2 className="text-lg font-semibold flex items-center gap-2">📅 EOL Planning</h2>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Lifetime Cycles Completed</h6>
                      <div className="text-5xl font-bold mb-2">{stats.totalCycles}</div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm text-center">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">EOL Forecast</h6>
                      <div className="text-5xl font-bold mb-2">{Math.round((500000 - stats.totalCycles) / Math.max(stats.avgCycleCount, 1))}</div>
                      <div className="text-sm text-gray-500 mb-4">Days Remaining (est.)</div>
                      <div className="text-left text-xs space-y-1">
                        <div>Current Usage: <span className="font-semibold">{((stats.totalCycles / 500000) * 100).toFixed(1)}%</span></div>
                        <div>Target Life: <span className="font-semibold">500,000 cycles</span></div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                      <h6 className="text-sm font-semibold text-gray-600 mb-4">Cycle Projection</h6>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={cycleCountData.map((d, i) => ({ 
                          day: d.day,
                          projected: stats.totalCycles + (i * stats.avgCycleCount)
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" style={{ fontSize: '10px' }} />
                          <YAxis style={{ fontSize: '10px' }} />
                          <Tooltip />
                          <Line type="monotone" dataKey="projected" stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={2} name="Projected Cycles" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}