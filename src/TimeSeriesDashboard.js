import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart } from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import logo from "./logo.jpeg";
// Chevron icons
const ChevronDown = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRight = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

// ==================== UTILITIES ====================
const formatValue = (value) => {
  if (typeof value !== 'number') return value;
  return value % 1 === 0 ? value : value.toFixed(2);
};

// ==================== BUSINESS LOGIC ====================
const DataProcessor = {
  parseCSV: (csvContent, onProgress, onComplete, onError) => {
    const allRows = [];
    let processedCount = 0;
    
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      step: (row) => {
        if (row.data && row.data.Time && row.data.deviceId && row.data.measure_name) {
          allRows.push(row.data);
          processedCount++;
          if (processedCount % 1000 === 0) {
            onProgress(Math.min(90, (processedCount / 5000) * 100));
          }
        }
      },
      complete: () => {
        onProgress(95);
        onComplete(allRows);
        onProgress(100);
      },
      error: onError
    });
  },

  pivotLongToWide: (rows) => {
    const byDevice = _.groupBy(rows, 'deviceId');
    const processed = {};
    
    Object.entries(byDevice).forEach(([deviceId, deviceRows]) => {
      const byTime = _.groupBy(deviceRows, 'Time');
      
      const timeSeries = Object.entries(byTime).map(([time, measures]) => {
        const point = { 
          time: new Date(time), 
          timeStr: new Date(time).toLocaleTimeString(),
          timestamp: new Date(time).getTime()
        };
        
        measures.forEach(m => {
          point[m.measure_name] = m.measure_value;
        });
        
        return point;
      }).sort((a, b) => a.timestamp - b.timestamp);
      
      const cycleSummaries = timeSeries.filter(t => t['cycle.durationS'] !== undefined);
      const realTimeData = timeSeries.filter(t => 
        t['voltage.U1'] !== undefined || 
        t['DI1_KM'] !== undefined ||
        t['temperature.ambient'] !== undefined
      );
      
      processed[deviceId] = { timeSeries, cycleSummaries, realTimeData, deviceId };
    });
    
    return processed;
  }
};

const MetricsCalculator = {
  calculateUtilization: (cycles) => {
    if (!cycles.length) return 0;
    const totalDuration = _.sumBy(cycles, 'cycle.durationS');
    const avgDuration = totalDuration / cycles.length;
    return Math.min(100, (avgDuration / 30) * 100);
  },

  calculateCycleMetrics: (cycles) => {
    if (!cycles.length) return { trends: [], total: 0, avgPerDay: 0 };
    
    const total = cycles.length;
    const dailyData = _.groupBy(cycles, c => new Date(c.time).toLocaleDateString());
    const avgPerDay = Object.keys(dailyData).length > 0 ? 
      total / Object.keys(dailyData).length : 0;
    
    return { total, avgPerDay: Math.round(avgPerDay) };
  },

  calculateDailyData: (cycles) => {
    if (!cycles.length) return [];
    
    const byDate = _.groupBy(cycles, c => {
      const date = new Date(c.time);
      return date.getDate().toString().padStart(2, '0') + ' Oct';
    });
    
    return Object.entries(byDate).map(([date, dayCycles]) => ({
      date,
      count: dayCycles.length,
      runtime: parseFloat((_.sumBy(dayCycles, 'cycle.durationS') / 3600).toFixed(2)),
      avgDuration: parseFloat((_.meanBy(dayCycles, 'cycle.durationS') || 0).toFixed(2)),
      bales: Math.floor(dayCycles.length / 70) || 1
    })).slice(-7);
  },

  calculateElectricalMetrics: (cycles) => {
    if (!cycles.length) return { inrush: [], voltage: [] };
    
    const dailyData = MetricsCalculator.calculateDailyData(cycles);
    
    const inrush = dailyData.map(d => ({
      date: d.date,
      phaseA: parseFloat((Math.random() * 200 + 50).toFixed(2)),
      phaseB: parseFloat((Math.random() * 200 + 50).toFixed(2)),
      phaseC: parseFloat((Math.random() * 200 + 50).toFixed(2))
    }));
    
    const voltage = dailyData.map(d => ({
      date: d.date,
      U1: parseFloat((Math.random() * 50 + 200).toFixed(2)),
      U2: parseFloat((Math.random() * 50 + 200).toFixed(2)),
      U3: parseFloat((Math.random() * 50 + 200).toFixed(2)),
      sag: parseFloat((Math.random() * 100).toFixed(2))
    }));
    
    return { inrush, voltage };
  },

  calculateIdleActiveTime: (realTimeData, cycles) => {
    if (!realTimeData.length || !cycles.length) return { data: [], activeHours: 0, idleHours: 0, activePercent: 0 };
    
    const activeCount = realTimeData.filter(r => r['DI1_KM'] === 1).length;
    const totalCount = realTimeData.length;
    
    const readingIntervalHours = 25 / 3600000;
    const activeHours = activeCount * readingIntervalHours;
    const totalHours = totalCount * readingIntervalHours;
    const idleHours = Math.max(0, totalHours - activeHours);
    const activePercent = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
    
    const byDate = _.groupBy(realTimeData, r => {
      const date = new Date(r.time);
      return date.getDate().toString().padStart(2, '0') + ' Oct';
    });
    
    const data = Object.entries(byDate).map(([date, dayData]) => {
      const dayActiveCount = dayData.filter(r => r['DI1_KM'] === 1).length;
      const dayTotalCount = dayData.length;
      const dayActiveHours = dayActiveCount * readingIntervalHours;
      const dayIdleHours = (dayTotalCount * readingIntervalHours) - dayActiveHours;
      
      return {
        date,
        activeHours: parseFloat(dayActiveHours.toFixed(2)),
        idleHours: parseFloat(dayIdleHours.toFixed(2)),
        utilization: dayTotalCount > 0 ? parseFloat(((dayActiveCount / dayTotalCount) * 100).toFixed(1)) : 0
      };
    }).slice(-7);
    
    return {
      data,
      activeHours: parseFloat(activeHours.toFixed(2)),
      idleHours: parseFloat(idleHours.toFixed(2)),
      totalHours: parseFloat(totalHours.toFixed(2)),
      activePercent: parseFloat(activePercent.toFixed(1))
    };
  },

  calculateUtilizationHeatmap: (realTimeData) => {
    if (!realTimeData.length) return {};
    
    // Group by day and hour - sort first to ensure consistent ordering
    const sortedData = [...realTimeData].sort((a, b) => a.timestamp - b.timestamp);
    const heatmapData = {};
    
    sortedData.forEach(record => {
      const date = new Date(record.time);
      const day = date.getDate().toString().padStart(2, '0') + ' Oct';
      const hour = date.getHours();
      
      // Only track hours 8-19
      if (hour >= 8 && hour <= 19) {
        const key = day + '-' + hour;
        if (!heatmapData[key]) {
          heatmapData[key] = { active: 0, total: 0, day: day, hour: hour };
        }
        
        heatmapData[key].total++;
        if (record['DI1_KM'] === 1) {
          heatmapData[key].active++;
        }
      }
    });
    
    // Calculate utilization % for each cell and return stable object
    const result = {};
    Object.entries(heatmapData).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, counts]) => {
      const utilizationPercent = counts.total > 0 ? (counts.active / counts.total) * 100 : 0;
      result[key] = parseFloat(utilizationPercent.toFixed(2));
    });
    
    return result;
  },

  calculateEnergyHeatmap: (cycles) => {
    if (!cycles.length) return {};
    
    // Sort cycles first to ensure consistent ordering
    const sortedCycles = [...cycles].sort((a, b) => a.timestamp - b.timestamp);
    const heatmapData = {};
    
    sortedCycles.forEach(cycle => {
      const date = new Date(cycle.time);
      const day = date.getDate().toString().padStart(2, '0') + ' Oct';
      const hour = date.getHours();
      
      // Only track hours 8-19
      if (hour >= 8 && hour <= 19) {
        const key = day + '-' + hour;
        if (!heatmapData[key]) {
          heatmapData[key] = 0;
        }
        
        heatmapData[key] += (cycle['energy.workWh'] || 0);
      }
    });
    
    // Return stable object with sorted keys
    const result = {};
    Object.entries(heatmapData).sort((a, b) => a[0].localeCompare(b[0])).forEach(([key, energy]) => {
      result[key] = parseFloat(energy.toFixed(2));
    });
    
    return result;
  },

  calculateChamberFullness: (realTimeData, cycles) => {
    if (!realTimeData.length) return { percent: 0, color: 'bg-green-600', level: 'Low' };
    
    const fullErrorIndices = realTimeData
      .map((r, idx) => r['DI8_Full_Error'] === 1 ? idx : -1)
      .filter(idx => idx !== -1);
    
    const lastFullErrorIdx = fullErrorIndices.length > 0 ? Math.max(...fullErrorIndices) : -1;
    const cyclesSinceLastFull = lastFullErrorIdx >= 0 ? 
      cycles.filter(c => c.timestamp > realTimeData[lastFullErrorIdx].timestamp).length : 
      cycles.length;
    
    const fullnessPercent = Math.min(100, (cyclesSinceLastFull / 75) * 100);
    
    let color, level;
    if (fullnessPercent < 33) {
      color = 'bg-green-600';
      level = 'Low';
    } else if (fullnessPercent < 67) {
      color = 'bg-yellow-400';
      level = 'Medium';
    } else {
      color = 'bg-rose-400';
      level = 'High';
    }
    
    return { percent: Math.round(fullnessPercent), color, level };
  },

  calculateEnergyMetrics: (cycles) => {
    if (!cycles.length) return { efficiency: [] };
    
    const dailyData = MetricsCalculator.calculateDailyData(cycles);
    
    const efficiency = dailyData.map(d => ({
      date: d.date,
      baler1: parseFloat((Math.random() * 200 + 50).toFixed(2)),
      efficiency: parseFloat((Math.random() * 30 + 70).toFixed(2)),
      powerFactor: parseFloat((Math.random() * 2 + 2).toFixed(2))
    }));

    return { efficiency };
  },

  calculateAnomalyMetrics: (cycles) => {
    if (!cycles.length) return { score: 0, breakdown: [], recent: [] };
    
    const dailyData = MetricsCalculator.calculateDailyData(cycles);
    
    const breakdown = dailyData.map(d => ({
      date: d.date,
      anomaly1: Math.floor(Math.random() * 5),
      anomaly2: Math.floor(Math.random() * 8),
      anomaly3: Math.floor(Math.random() * 6),
      anomaly4: Math.floor(Math.random() * 3)
    }));

    const recent = [
      { type: 'Anomaly 4', date: '10/10/2025' },
      { type: 'Anomaly 3', date: '10/10/2025' },
      { type: 'Anomaly 2', date: '10/10/2025' },
      { type: 'Anomaly 1', date: '10/10/2025' }
    ];
    
    return { score: 5, breakdown, recent };
  },

  calculateSafetyMetrics: (realTimeData) => {
    if (!realTimeData.length) return { eStop: 0, door: 0, errors: 0, mtbf: 20, events: [] };
    
    const eStop = realTimeData.filter(d => d['DI2_ES_Overload_Key'] === 1).length;
    const door = realTimeData.filter(d => d['DI4_Door'] === 1 && d['DI1_KM'] === 1).length;
    const errors = realTimeData.filter(d => d['DI8_Full_Error'] === 1).length;
    
    const events = realTimeData
      .filter(d => d['DI2_ES_Overload_Key'] === 1 || (d['DI4_Door'] === 1 && d['DI1_KM'] === 1) || d['DI8_Full_Error'] === 1)
      .slice(-7)
      .map(d => {
        let issue = 'Unknown';
        if (d['DI2_ES_Overload_Key'] === 1) issue = 'Overload';
        else if (d['DI8_Full_Error'] === 1) issue = 'Full';
        else if (d['DI4_Door'] === 1) issue = 'Gate Down';
        
        return {
          device: 'Baler 1',
          issue,
          time: new Date(d.time).toLocaleString()
        };
      });
    
    return { eStop, door, errors, mtbf: 20, events };
  },

  calculateEOLMetrics: (cycles) => {
    if (!cycles.length) return { lifetimeCycles: 0, remaining: 100, remainingCycles: 50000, rulDays: 0, forecast: [] };
    
    const lifetimeCycles = cycles.length;
    const LIFETIME_THRESHOLD = 50000;
    
    const remainingCycles = Math.max(0, LIFETIME_THRESHOLD - lifetimeCycles);
    const remainingLifePercent = (remainingCycles / LIFETIME_THRESHOLD) * 100;
    
    const timestamps = cycles.map(c => c.timestamp);
    const dataSpanDays = timestamps.length > 0 ? 
      (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24) : 1;
    
    const avgCyclesPerDay = dataSpanDays > 0 ? lifetimeCycles / dataSpanDays : lifetimeCycles;
    const rulDays = avgCyclesPerDay > 0 ? Math.floor(remainingCycles / avgCyclesPerDay) : 0;
    
    const dates = ['09 Oct', '10 Oct', '11 Oct', '12 Oct', '13 Oct', '14 Oct', '15 Oct', '16 Oct', '17 Oct'];
    const forecast = dates.map((date, idx) => {
      const projectedCycles = lifetimeCycles + (avgCyclesPerDay * idx);
      const projectedRemaining = Math.max(0, ((LIFETIME_THRESHOLD - projectedCycles) / LIFETIME_THRESHOLD) * 100);
      
      return {
        date,
        remaining: parseFloat(projectedRemaining.toFixed(2))
      };
    });
    
    return { 
      lifetimeCycles, 
      remaining: parseFloat(remainingLifePercent.toFixed(1)),
      remainingCycles,
      rulDays,
      forecast 
    };
  }
};

// ==================== UI COMPONENTS ====================
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
      <p className="font-semibold text-zinc-900 mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
          <span className="text-stone-500">{entry.name}:</span>
          <span className="font-semibold text-zinc-900 ml-auto">
            {formatValue(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const LoadingScreen = ({ progress }) => (
  <div className="h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
    <div className="text-center p-8 rounded-2xl bg-white/10 backdrop-blur-lg border border-white/20">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-r from-blue-500 to-purple-600" 
             style={{ clipPath: 'polygon(0 0, ' + progress + '% 0, ' + progress + '% 100%, 0 100%)' }}>
          <div className="absolute inset-2 rounded-full bg-slate-900 flex items-center justify-center">
            <span className="text-lg font-bold text-white">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
      <div className="text-xl font-semibold mb-2 text-white">Processing Data</div>
      <div className="text-sm text-slate-300">Analyzing telemetry records...</div>
    </div>
  </div>
);

const UploadScreen = ({ onFileSelect }) => {
  const fileInputRef = useRef(null);
  
  return (
    <div className="h-screen flex items-center justify-center p-4 bg-neutral-100">
      <div className="text-center p-12 rounded-2xl bg-white shadow-lg max-w-md">
        <div className="p-6 rounded-full mb-8 mx-auto w-fit bg-blue-100">
          <svg className="w-16 h-16 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h2 className="text-3xl font-bold mb-4 text-zinc-900">Upload Telemetry Data</h2>
        <p className="text-lg mb-8 text-stone-500">Import your time-series CSV file</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-8 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all"
        >
          Choose CSV File
        </button>
      </div>
    </div>
  );
};

const SectionHeader = ({ title, isExpanded, onToggle }) => (
  <div 
    className="p-2 bg-white rounded-md shadow-sm border border-yellow-400 flex items-center cursor-pointer hover:bg-gray-50 transition-colors"
    onClick={onToggle}
  >
    <div className="pl-4 text-zinc-900 text-xl font-semibold flex-1">{title}</div>
    <div className="pr-4">
      {isExpanded ? <ChevronDown className="w-5 h-5 text-zinc-900" /> : <ChevronRight className="w-5 h-5 text-zinc-900" />}
    </div>
  </div>
);

// ==================== MAIN DASHBOARD ====================
const KomarDashboard = () => {
  const [rawData, setRawData] = useState([]);
  const [processedData, setProcessedData] = useState({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [expandedSections, setExpandedSections] = useState({
    performance: false,
    electrical: false,
    utilization: false,
    energy: false,
    anomaly: false,
    safety: false,
    eol: false
  });

  const performanceRef = useRef(null);
  const electricalRef = useRef(null);
  const utilizationRef = useRef(null);
  const energyRef = useRef(null);
  const anomalyRef = useRef(null);
  const safetyRef = useRef(null);
  const eolRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setProgress(0);
    
    try {
      const text = await file.text();
      DataProcessor.parseCSV(
        text,
        setProgress,
        (rows) => {
          const pivoted = DataProcessor.pivotLongToWide(rows);
          setRawData(rows);
          setProcessedData(pivoted);
          setLoading(false);
        },
        (error) => {
          console.error('Parse error:', error);
          setLoading(false);
        }
      );
    } catch (error) {
      console.error('Error reading file:', error);
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({...prev, [section]: !prev[section]}));
  };

  const scrollToSection = (section, ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setExpandedSections(prev => ({...prev, [section]: true}));
  };

  const currentDevice = useMemo(() => {
    return Object.values(processedData)[0];
  }, [processedData]);

  const utilization = useMemo(() => 
    currentDevice ? MetricsCalculator.calculateUtilization(currentDevice.cycleSummaries) : 0,
    [currentDevice]
  );

  const cycleMetrics = useMemo(() => 
    currentDevice ? MetricsCalculator.calculateCycleMetrics(currentDevice.cycleSummaries) : { total: 0, avgPerDay: 0 },
    [currentDevice]
  );

  const dailyData = useMemo(() => 
    currentDevice ? MetricsCalculator.calculateDailyData(currentDevice.cycleSummaries) : [],
    [currentDevice]
  );

  const electricalMetrics = useMemo(() => 
    currentDevice ? MetricsCalculator.calculateElectricalMetrics(currentDevice.cycleSummaries) : { inrush: [], voltage: [] },
    [currentDevice]
  );

  const energyMetrics = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateEnergyMetrics(currentDevice.cycleSummaries) : { efficiency: [] },
    [currentDevice]
  );

  const anomalyMetrics = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateAnomalyMetrics(currentDevice.cycleSummaries) : { score: 0, breakdown: [], recent: [] },
    [currentDevice]
  );

  const safetyMetrics = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateSafetyMetrics(currentDevice.realTimeData) : { eStop: 0, door: 0, errors: 0, mtbf: 0, events: [] },
    [currentDevice]
  );

  const eolMetrics = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateEOLMetrics(currentDevice.cycleSummaries) : { lifetimeCycles: 0, remaining: 0, remainingCycles: 0, rulDays: 0, forecast: [] },
    [currentDevice]
  );

  const idleActiveMetrics = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateIdleActiveTime(currentDevice.realTimeData, currentDevice.cycleSummaries) : { data: [], activeHours: 0, idleHours: 0, activePercent: 0 },
    [currentDevice]
  );

  const chamberFullness = useMemo(() =>
    currentDevice ? MetricsCalculator.calculateChamberFullness(currentDevice.realTimeData, currentDevice.cycleSummaries) : { percent: 0, color: 'bg-green-600', level: 'Low' },
    [currentDevice]
  );

  const utilizationHeatmap = useMemo(() => {
    if (!currentDevice?.realTimeData) return {};
    return MetricsCalculator.calculateUtilizationHeatmap(currentDevice.realTimeData);
  }, [currentDevice?.realTimeData?.length, currentDevice?.deviceId]);

  const energyHeatmap = useMemo(() => {
    if (!currentDevice?.cycleSummaries) return {};
    return MetricsCalculator.calculateEnergyHeatmap(currentDevice.cycleSummaries);
  }, [currentDevice?.cycleSummaries?.length, currentDevice?.deviceId]);

  if (loading) return <LoadingScreen progress={progress} />;
  if (!currentDevice) return <UploadScreen onFileSelect={handleFileUpload} />;

  return (
    <div className="w-full min-h-screen bg-neutral-100 flex">
      <div className="w-52 bg-white shadow-sm flex flex-col">
        <div className="pt-3 bg-white">
          <div className="pl-4 py-4 flex items-center gap-2">
            <img src={logo} alt="Komar Logo" className="w-20 h-15 object-contain rounded"/>
            {/* <div className="text-3xl font-medium text-zinc-900">Komar</div> */}
          </div>
        </div>
        <div className="py-1 bg-white flex flex-col flex-1">
          {/* <div 
            className={'cursor-pointer hover:bg-gray-50 transition-colors ' + (expandedSections.performance ? 'bg-red-700/10 border-r-2 border-red-600' : '')}
            onClick={() => scrollToSection('performance', performanceRef)}
          >
            <div className="pl-4 py-2.5 text-zinc-900">Performance</div>
          </div> */}
          <div className="px-4 pb-2 flex flex-col gap-1">
            {[
              { name: 'Performance', key: 'performance', ref: performanceRef },
              { name: 'Electrical Health', key: 'electrical', ref: electricalRef },
              { name: 'Utilization', key: 'utilization', ref: utilizationRef },
              { name: 'Energy Management', key: 'energy', ref: energyRef },
              { name: 'Anomaly Detection', key: 'anomaly', ref: anomalyRef },
              { name: 'Safety & Reliability', key: 'safety', ref: safetyRef },
              { name: 'EOL Planning', key: 'eol', ref: eolRef }
            ].map((item) => (
              <div 
                key={item.key} 
                className={'px-2 py-2.5 rounded-md text-zinc-900 text-base hover:bg-gray-100 cursor-pointer transition-colors ' + (expandedSections[item.key] ? 'bg-red-700/10 border-r-2 border-red-600' : '')}
                onClick={() => scrollToSection(item.key, item.ref)}
              >
                {item.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-auto">
        <div className="px-6 pt-4">
          <div className="py-3 bg-white rounded-md shadow-sm flex items-center">
            <div className="pl-4 text-zinc-900 text-xl font-semibold">Hey Immanuel!</div>
            <div className="flex-1 pr-6 flex justify-end items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-500"></div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 flex justify-between items-center">
          <div className="flex gap-4">
            <div className="flex items-center gap-4">
              <span className="text-stone-500">Device</span>
              <div className="h-8 px-3 bg-white rounded shadow-sm flex items-center">
                <span className="text-zinc-900">{currentDevice.deviceId}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-stone-500">Time Period</span>
              {/* <div className="h-8 px-3 bg-white rounded shadow-sm flex items-center">
                <span className="text-zinc-900">Last 7 Days</span>
              </div> */}
              <select defaultValue="Last 7 Days" className="h-8 px-3 bg-white rounded shadow-sm text-zinc-900">
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
              </select>
            </div>
          </div>
          <div className="text-zinc-900 text-sm">Last Updated: {new Date().toLocaleString()}</div>
        </div>

        <div className="px-6 flex flex-col gap-6" ref={performanceRef}>
          <SectionHeader 
            title="Performance" 
            isExpanded={expandedSections.performance}
            onToggle={() => toggleSection('performance')}
          />

          {expandedSections.performance && (
            <>
              <div className="flex gap-6">
                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm flex flex-col gap-4">
                  <div className="text-stone-500">Utilization Rate</div>
                  <div className="flex justify-center">
                    <div className="flex flex-col items-center">
                      <div className="text-zinc-900 text-sm mb-2">Baler 1</div>
                      <div className="relative w-32 h-32">
                        <svg className="w-full h-full -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#e5e7eb" strokeWidth="12"/>
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#10b981" strokeWidth="12"
                            strokeDasharray={(utilization / 100) * 352 + ' 352'}/>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold text-neutral-800">{Math.round(utilization)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Chamber Fullness Estimate</div>
                  <div className="flex flex-col items-center gap-4">
                    <div className="text-center">
                      <div className="text-zinc-900 text-sm mb-2">Baler 1</div>
                      <div className="relative w-24 h-32 bg-gray-200 rounded-t-lg border-2 border-zinc-600 overflow-hidden">
                        <div 
                          className={'absolute bottom-0 w-full transition-all duration-500 ' + chamberFullness.color}
                          style={{ height: 60 + '%' }}
                        ></div>
                      </div>
                      <div className="text-sm font-semibold mt-2">{60}% - {chamberFullness.level}</div>
                    </div>
                    <div className="flex gap-2 text-xs flex-wrap justify-center">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                        <span>Low (0-33%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                        <span>Med (34-66%)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-rose-400 rounded-sm"></div>
                        <span>High (67-100%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-6">
                  <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                    <div className="text-stone-500 mb-2">Total Cycle Count</div>
                    <div className="text-4xl font-medium text-zinc-900">{cycleMetrics.total}</div>
                    <div className="h-16 mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyData}>
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Cycles" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                    <div className="text-stone-500 mb-2">Avg Cycle Count</div>
                    <div className="text-4xl font-normal text-zinc-900">{cycleMetrics.avgPerDay}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-5">
                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-2">Total Runtime Vs Cycle Duration</div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar yAxisId="left" dataKey="runtime" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Runtime (hrs)" />
                        <Line yAxisId="right" dataKey="avgDuration" stroke="#64748b" strokeWidth={2} name="Avg Duration (s)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-2">Cycle Count</div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" fill="#f472b6" radius={[4, 4, 0, 0]} name="Cycle Count" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-2">Cycle Performance</div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar yAxisId="left" dataKey="count" fill="#f472b6" radius={[4, 4, 0, 0]} name="Cycle Count" />
                        <Line yAxisId="right" dataKey="avgDuration" stroke="#18181b" strokeWidth={2} name="Avg Duration (s)" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-2">Bales Produced</div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="bales" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Bales" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6" ref={electricalRef}>
          <SectionHeader 
            title="Electrical Health" 
            isExpanded={expandedSections.electrical}
            onToggle={() => toggleSection('electrical')}
          />

          {expandedSections.electrical && (
            <div className="flex gap-6">
              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">Current Inrush</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={electricalMetrics.inrush}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="phaseA" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Phase A (A)" />
                      <Bar dataKey="phaseB" fill="#f472b6" radius={[4, 4, 0, 0]} name="Phase B (A)" />
                      <Bar dataKey="phaseC" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Phase C (A)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">Voltage Quality</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={electricalMetrics.voltage}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar yAxisId="left" dataKey="U1" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Phase A (V)" />
                      <Bar yAxisId="left" dataKey="U2" fill="#fbbf24" radius={[4, 4, 0, 0]} name="Phase B (V)" />
                      <Bar yAxisId="left" dataKey="U3" fill="#7dd3fc" radius={[4, 4, 0, 0]} name="Phase C (V)" />
                      <Line yAxisId="right" dataKey="sag" stroke="#18181b" strokeWidth={2} name="Worksag (%)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6" ref={utilizationRef}>
          <SectionHeader 
            title="Utilization" 
            isExpanded={expandedSections.utilization}
            onToggle={() => toggleSection('utilization')}
          />

          {expandedSections.utilization && (
            <div className="flex gap-6">
              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-4">Utilization Rate Matrix</div>
                <div className="text-xs text-stone-500 mb-2">Hours of Day</div>
                <table className="w-full" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr>
                      <th className="text-left p-1"></th>
                      {[8,9,10,11,12,13,14,15,16,17,18,19].map(h => (
                        <th key={h} className="text-center p-1 text-stone-500">{h}:00</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['04 Oct', '05 Oct', '06 Oct', '07 Oct', '08 Oct', '09 Oct', '10 Oct'].map((day) => (
                      <tr key={day}>
                        <td className="text-stone-500 text-right pr-2 py-1">{day}</td>
                        {[8,9,10,11,12,13,14,15,16,17,18,19].map(h => {
                          const val = Math.floor(Math.random() * 4);
                          const colors = ['bg-gray-200', 'bg-rose-400', 'bg-yellow-400', 'bg-green-600'];
                          return (
                            <td key={'util-' + day + '-' + h} className="p-0.5">
                              <div className={'h-8 w-full rounded ' + colors[val]}></div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center gap-3 mt-3 text-xs flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                    <span>No Util</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-rose-400 rounded-sm"></div>
                    <span>Low</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                    <span>Medium</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                    <span>High</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">Idle Vs Active Time</div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                      <span>Idle</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-slate-400 rounded-sm"></div>
                      <span>Active</span>
                    </div>
                  </div>
                  <div className="text-stone-500">
                    Active: {idleActiveMetrics.activeHours.toFixed(2)}h ({idleActiveMetrics.activePercent}%)
                  </div>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={idleActiveMetrics.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area yAxisId="left" dataKey="activeHours" stackId="1" fill="#94a3b8" stroke="#94a3b8" name="Active (hrs)" />
                      <Area yAxisId="left" dataKey="idleHours" stackId="1" fill="#fbbf24" stroke="#fbbf24" name="Idle (hrs)" />
                      <Line yAxisId="right" dataKey="utilization" stroke="#18181b" strokeWidth={2} name="Utilization %" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6" ref={energyRef}>
          <SectionHeader 
            title="Energy Management" 
            isExpanded={expandedSections.energy}
            onToggle={() => toggleSection('energy')}
          />

          {expandedSections.energy && (
            <div className="flex gap-6">
              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">Energy Efficiency</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={energyMetrics.efficiency}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar yAxisId="left" dataKey="baler1" fill="#7dd3fc" radius={[4, 4, 0, 0]} name="Energy (kWh)" />
                      <Line yAxisId="right" dataKey="efficiency" stroke="#18181b" strokeWidth={2} name="Efficiency %" />
                      <Line yAxisId="right" dataKey="powerFactor" stroke="#f87171" strokeWidth={2} name="Power Factor" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-4">Hourly Energy Pattern</div>
                <div className="text-xs text-stone-500 mb-2">Hours of Day</div>
                <table className="w-full" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr>
                      <th className="text-left p-1"></th>
                      {[8,9,10,11,12,13,14,15,16,17,18,19].map(h => (
                        <th key={h} className="text-center p-1 text-stone-500">{h}:00</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['04 Oct', '05 Oct', '06 Oct', '07 Oct', '08 Oct', '09 Oct', '10 Oct'].map((day) => (
                      <tr key={day}>
                        <td className="text-stone-500 text-right pr-2 py-1">{day}</td>
                        {[8,9,10,11,12,13,14,15,16,17,18,19].map(h => {
                          const val = Math.floor(Math.random() * 4);
                          const colors = ['bg-gray-200', 'bg-rose-300/60', 'bg-rose-400', 'bg-red-600'];
                          return (
                            <td key={'energy-' + day + '-' + h} className="p-0.5">
                              <div className={'h-8 w-full rounded ' + colors[val]}></div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center gap-2 mt-3 text-xs flex-wrap">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                    <span>Nil</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-rose-300/60 rounded-sm"></div>
                    <span>Low</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-rose-400 rounded-sm"></div>
                    <span>Med</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
                    <span>High</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6" ref={anomalyRef}>
          <SectionHeader 
            title="Anomaly Detection" 
            isExpanded={expandedSections.anomaly}
            onToggle={() => toggleSection('anomaly')}
          />

          {expandedSections.anomaly && (
            <div className="flex gap-6">
              <div className="flex flex-col gap-6 w-64">
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Anomaly Detection Score</div>
                  <div className="text-stone-500 text-xs mb-2">Baler 1</div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-normal text-zinc-900">{anomalyMetrics.score}</span>
                    <div className="w-4 h-4 bg-red-700 rounded-full opacity-50"></div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-white rounded-md shadow-sm flex-1">
                  <div className="text-stone-500 mb-4">Devices &gt; 3 Anomalies</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-600 rounded-sm flex items-center justify-center text-white text-xs">0</div>
                      <span className="text-neutral-400 text-sm">Baler 1</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">Anomaly Breakdown</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={anomalyMetrics.breakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="anomaly1" stackId="a" fill="#f472b6" name="Anomaly 1" />
                      <Bar dataKey="anomaly2" stackId="a" fill="#fbbf24" name="Anomaly 2" />
                      <Bar dataKey="anomaly3" stackId="a" fill="#fbbf24" name="Anomaly 3" />
                      <Bar dataKey="anomaly4" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Anomaly 4" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="w-64 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-4">Recent Anomalies</div>
                <div className="flex flex-col gap-3">
                  {anomalyMetrics.recent.map((anomaly, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-slate-400 rounded-full opacity-50"></div>
                        <span className="text-neutral-400 text-sm">{anomaly.type}</span>
                      </div>
                      <span className="text-neutral-400 text-sm">{anomaly.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6" ref={safetyRef}>
          <SectionHeader 
            title="Safety & Reliability" 
            isExpanded={expandedSections.safety}
            onToggle={() => toggleSection('safety')}
          />

          {expandedSections.safety && (
            <div className="flex gap-6">
              <div className="flex flex-col gap-6">
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">E Stop Activations</div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-normal text-zinc-900">{safetyMetrics.eStop}</span>
                    <div className="w-4 h-4 bg-red-700 rounded-full opacity-50"></div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Door/Gate Violations</div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-normal text-zinc-900">{safetyMetrics.door}</span>
                    <div className="w-4 h-4 bg-red-700 rounded-full opacity-50"></div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Cycle Errors</div>
                  <div className="flex items-center gap-2">
                    <span className="text-4xl font-normal text-zinc-900">{safetyMetrics.errors}</span>
                    <div className="w-4 h-4 bg-red-700 rounded-full opacity-50"></div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">MTBF</div>
                  <div className="text-4xl font-normal text-zinc-900">{safetyMetrics.mtbf} <span className="text-base">hrs</span></div>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-4">Digital Input Timeline</div>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-zinc-500">Device</th>
                        <th className="text-left py-2 text-zinc-500">Issue</th>
                        <th className="text-left py-2 text-zinc-500">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {safetyMetrics.events.map((event, idx) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2 text-neutral-600">{event.device}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <div className="w-3 h-3 bg-yellow-400 rounded-full opacity-50"></div>
                              <span className="text-neutral-600">{event.issue}</span>
                            </div>
                          </td>
                          <td className="py-2 text-neutral-600 text-xs">{event.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 flex flex-col gap-6 mt-6 mb-8" ref={eolRef}>
          <SectionHeader 
            title="EOL Planning" 
            isExpanded={expandedSections.eol}
            onToggle={() => toggleSection('eol')}
          />

          {expandedSections.eol && (
            <div className="flex gap-6">
              <div className="flex flex-col gap-6">
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Lifetime Cycles Completed</div>
                  <div className="text-4xl font-normal text-zinc-900">{eolMetrics.lifetimeCycles}</div>
                </div>
                <div className="px-6 py-4 bg-white rounded-md shadow-sm">
                  <div className="text-stone-500 mb-4">Remaining Life %</div>
                  <div className="mb-2">
                    <div className="text-2xl font-normal text-green-700">{eolMetrics.remaining}%</div>
                    <div className="text-xs text-stone-500 mt-1">
                      {eolMetrics.remainingCycles.toLocaleString()} cycles remaining
                    </div>
                  </div>
                  <div className="w-20 h-1 bg-gray-200 rounded-full mt-2">
                    <div className="h-1 bg-green-700 rounded-full" style={{ width: Math.min(100, eolMetrics.remaining) + '%' }}></div>
                  </div>
                  <div className="text-xs text-stone-500 mt-2">
                    Est. {eolMetrics.rulDays} days until EOL
                  </div>
                </div>
              </div>

              <div className="flex-1 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-2">EOL Forecast</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={eolMetrics.forecast}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line dataKey="remaining" stroke="#64748b" strokeWidth={2} name="Remaining Life %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="w-64 px-6 py-4 bg-white rounded-md shadow-sm">
                <div className="text-stone-500 mb-4">EOL Machines List</div>
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-600 text-sm">Baler 1</span>
                    <div className="w-20 h-1 bg-gray-200 rounded-full">
                      <div className="h-1 rounded-full bg-gray-400" 
                        style={{ width: Math.min(100, eolMetrics.remaining) + '%' }}></div>
                    </div>
                    <span className="text-neutral-600 text-xs">{eolMetrics.remaining}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KomarDashboard;