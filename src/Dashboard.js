import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ScatterChart, Scatter, RadialBarChart, RadialBar } from 'recharts';
import { Activity, AlertTriangle, Cpu, TrendingUp, TrendingDown, Zap, Shield, Clock, BarChart3, Gauge, AlertCircle, Upload, RefreshCw, Box, ChevronUp, ChevronDown, Settings, Users, Power, Timer, Database, Wifi, Signal, Menu, X, Target, Wrench, Battery } from 'lucide-react';
import Papa from 'papaparse';
import _ from 'lodash';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [errorMessage, setErrorMessage] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef(null);

  // Professional dark theme with excellent contrast
  const theme = {
    bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    card: 'rgba(30, 41, 59, 0.95)',
    cardHover: 'rgba(51, 65, 85, 0.95)',
    glass: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(148, 163, 184, 0.2)',
    borderLight: 'rgba(148, 163, 184, 0.3)',
    text: {
      primary: '#f8fafc',
      secondary: '#e2e8f0',
      muted: '#94a3b8',
      accent: '#3b82f6'
    },
    colors: {
      primary: '#3b82f6',      // Blue
      success: '#10b981',      // Emerald
      warning: '#f59e0b',      // Amber
      danger: '#ef4444',       // Red
      info: '#06b6d4',         // Cyan
      purple: '#8b5cf6',       // Violet
      teal: '#14b8a6',         // Teal
      orange: '#f97316',       // Orange
      indigo: '#6366f1'        // Indigo
    },
    gradients: {
      primary: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      danger: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      purple: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      teal: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)'
    },
    chart: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#6366f1'],
    shadows: {
      sm: '0 1px 3px 0 rgba(0, 0, 0, 0.4), 0 1px 2px 0 rgba(0, 0, 0, 0.3)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.4)',
      glow: '0 0 20px rgba(59, 130, 246, 0.4)'
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [selectedDevice, selectedTimeRange, originalData]);

  const applyFilters = () => {
    if (!originalData.length) return;
    
    let filtered = [...originalData];
    
    if (selectedDevice !== 'all') {
      filtered = filtered.filter(d => d.device_id === selectedDevice);
    }
    
    const now = new Date(Math.max(...originalData.map(d => new Date(d.cycle_started_at))));
    let startDate;
    
    switch (selectedTimeRange) {
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }
    
    filtered = filtered.filter(d => new Date(d.cycle_started_at) >= startDate);
    setData(filtered);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setErrorMessage('');
    
    try {
      const text = await file.text();
      processCSVData(text);
    } catch (error) {
      console.error('Error reading file:', error);
      setErrorMessage('Failed to read file.');
      setLoading(false);
    }
  };

  const processCSVData = (csvContent) => {
    try {
      const parsed = Papa.parse(csvContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });
      
      if (!parsed.data || parsed.data.length === 0) {
        throw new Error('Empty CSV file');
      }
      
      const processedData = parsed.data.map(row => ({
        ...row,
        date: new Date(row.cycle_started_at),
        dateStr: new Date(row.cycle_started_at).toLocaleDateString(),
        hour: new Date(row.cycle_started_at).getHours(),
        dayOfWeek: new Date(row.cycle_started_at).getDay(),
        runtime_hours: row.cycle_duration_ms / 1000 / 3600,
        e_stop: row.di_e_stop_triggered === 'True' || row.di_e_stop_triggered === true,
        overload: row.di_overload_trip === 'True' || row.di_overload_trip === true,
        valve_issue: row.di_valve_extend_feedback_ok === 'False' || row.di_valve_retract_feedback_ok === 'False',
        anomaly: row.health_anomaly_score > 0.5,
        current_imbalance: ((Math.max(row.electrical_peak_current_rms_phase_a_a, row.electrical_peak_current_rms_phase_b_a, row.electrical_peak_current_rms_phase_c_a) - 
                            Math.min(row.electrical_peak_current_rms_phase_a_a, row.electrical_peak_current_rms_phase_b_a, row.electrical_peak_current_rms_phase_c_a)) / 
                            ((row.electrical_peak_current_rms_phase_a_a + row.electrical_peak_current_rms_phase_b_a + row.electrical_peak_current_rms_phase_c_a) / 3)) * 100,
        energy_per_cycle: row.energy_active_kwh,
        pressure_overshoot: ((row.hydraulic_max_pressure_psi - row.hydraulic_avg_pressure_psi) / row.hydraulic_avg_pressure_psi) * 100
      })).filter(row => !isNaN(row.date.getTime()));
      
      setOriginalData(processedData);
      setData(processedData);
      setLoading(false);
      setErrorMessage('');
      
    } catch (error) {
      console.error('Error processing CSV:', error);
      setErrorMessage(error.message || 'Failed to process CSV');
      setData([]);
      setOriginalData([]);
      setLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    
    try {
      const response = await fetch('/multi_device_telemetry_7days.csv');
      if (!response.ok) {
        throw new Error('Please upload CSV file');
      }
      const csvContent = await response.text();
      processCSVData(csvContent);
    } catch (error) {
      console.error('Error loading data:', error);
      setErrorMessage(error.message);
      setData([]);
      setOriginalData([]);
      setLoading(false);
    }
  };

  // Comprehensive Fleet Overview Metrics
  const fleetMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const totalRuntime = _.sumBy(data, 'runtime_hours');
    const totalCycles = data.length;
    const uniqueDevices = _.uniqBy(data, 'device_id').length;
    
    const latestDate = new Date(Math.max(...data.map(d => new Date(d.cycle_started_at))));
    const earliestDate = new Date(Math.min(...data.map(d => new Date(d.cycle_started_at))));
    const hoursInWindow = Math.max((latestDate - earliestDate) / (1000 * 60 * 60), 1);
    const utilizationRate = (totalRuntime / (uniqueDevices * hoursInWindow)) * 100;
    
    const errorCount = data.filter(d => d.e_stop || d.overload).length;
    const avgCyclesPerMachine = totalCycles / uniqueDevices;
    const totalEnergy = _.sumBy(data, 'energy_active_kwh');
    const totalBales = _.sumBy(data, 'productivity_bale_count_increment') || 0;
    
    return {
      totalRuntime: totalRuntime.toFixed(1),
      utilizationRate: Math.min(utilizationRate, 100).toFixed(1),
      totalCycles,
      errorCount,
      uniqueDevices,
      avgCyclesPerMachine: avgCyclesPerMachine.toFixed(1),
      totalEnergy: totalEnergy.toFixed(1),
      totalBales
    };
  }, [data]);

  // Machine Health Metrics with Trends
  const healthMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const avgCurrentImbalance = _.meanBy(data, 'current_imbalance');
    const avgPressureOvershoot = _.meanBy(data, 'pressure_overshoot');
    const avgEnergyPerCycle = _.meanBy(data, 'energy_per_cycle');
    
    const sortedCycleTimes = data.map(d => d.cycle_duration_ms).sort();
    const baselineCycleTime = sortedCycleTimes[Math.floor(sortedCycleTimes.length / 2)];
    const cycleTimeDrift = _.meanBy(data, d => ((d.cycle_duration_ms - baselineCycleTime) / baselineCycleTime) * 100);
    
    // Health trends for last 7 days
    const healthTrends = _.groupBy(data, 'dateStr');
    const trendData = Object.entries(healthTrends).map(([date, records]) => ({
      date: date.split('/')[0] + '/' + date.split('/')[1],
      currentImbalance: _.meanBy(records, 'current_imbalance') || 0,
      pressureOvershoot: _.meanBy(records, 'pressure_overshoot') || 0,
      cycleTimeDrift: _.meanBy(records, d => ((d.cycle_duration_ms - baselineCycleTime) / baselineCycleTime) * 100) || 0,
      energyPerCycle: _.meanBy(records, 'energy_per_cycle') || 0
    })).slice(-7);
    
    return {
      avgCurrentImbalance: (avgCurrentImbalance || 0).toFixed(1),
      avgPressureOvershoot: (avgPressureOvershoot || 0).toFixed(1),
      cycleTimeDrift: (cycleTimeDrift || 0).toFixed(1),
      avgEnergyPerCycle: (avgEnergyPerCycle || 0).toFixed(2),
      trendData
    };
  }, [data]);

  // Safety & Error Metrics
  const safetyMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const eStopCount = data.filter(d => d.e_stop).length;
    const overloadCount = data.filter(d => d.overload).length;
    const doorGateViolations = (_.sumBy(data, 'di_door_open_events') || 0) + (_.sumBy(data, 'di_gate_open_events') || 0);
    const valveIssues = data.filter(d => d.valve_issue).length;
    
    // Error trends over time
    const errorTrends = _.groupBy(data, 'dateStr');
    const errorTrendData = Object.entries(errorTrends).map(([date, records]) => ({
      date: date.split('/')[0] + '/' + date.split('/')[1],
      eStops: records.filter(r => r.e_stop).length,
      overloads: records.filter(r => r.overload).length,
      doorGate: (_.sumBy(records, 'di_door_open_events') || 0) + (_.sumBy(records, 'di_gate_open_events') || 0),
      valveIssues: records.filter(r => r.valve_issue).length
    })).slice(-7);
    
    return {
      eStopCount,
      overloadCount,
      doorGateViolations,
      valveIssues,
      errorTrendData
    };
  }, [data]);

  // Usage & Performance Metrics
  const usageMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const machineData = _.groupBy(data, 'device_id');
    const timeWindowHours = (() => {
      switch (selectedTimeRange) {
        case '24h': return 24;
        case '7d': return 7 * 24;
        case '30d': return 30 * 24;
        default: return 7 * 24; // Default to 7 days
      }
    })();
    
    const idleActiveData = Object.entries(machineData).map(([device, records]) => {
      const runtime = _.sumBy(records, 'runtime_hours') || 0;
      const idleTime = Math.max(0, timeWindowHours - runtime);
      const utilization = timeWindowHours > 0 ? (runtime / timeWindowHours) * 100 : 0;
      
      return {
        device: device.slice(-8),
        activeTime: parseFloat(runtime.toFixed(1)),
        idleTime: parseFloat(idleTime.toFixed(1)),
        utilization: parseFloat(utilization.toFixed(1)),
        totalTime: timeWindowHours
      };
    }).sort((a, b) => b.activeTime - a.activeTime);
    
    // Performance over time
    const performanceData = _.groupBy(data, 'dateStr');
    const performanceTrends = Object.entries(performanceData).map(([date, records]) => ({
      date: date.split('/')[0] + '/' + date.split('/')[1],
      cycles: records.length,
      runtime: _.sumBy(records, 'runtime_hours').toFixed(1),
      energy: _.sumBy(records, 'energy_active_kwh').toFixed(1),
      bales: _.sumBy(records, 'productivity_bale_count_increment') || 0,
      avgUtilization: _.meanBy(records, r => (r.runtime_hours / 24) * 100).toFixed(1)
    })).slice(-7);
    
    return {
      idleActiveData: idleActiveData.slice(0, 8),
      performanceTrends
    };
  }, [data, selectedTimeRange]);

  // Anomaly Detection & Analysis
  const anomalyMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const anomalyCount = data.filter(d => d.anomaly).length;
    const avgAnomalyScore = _.meanBy(data, 'health_anomaly_score') || 0;
    
    const machineAnomalies = _.groupBy(data.filter(d => d.anomaly), 'device_id');
    const highAnomalyMachines = Object.entries(machineAnomalies)
      .filter(([device, anomalies]) => anomalies.length > 3)
      .map(([device, anomalies]) => ({
        device,
        anomalyCount: anomalies.length,
        avgScore: (_.meanBy(anomalies, 'health_anomaly_score') * 100).toFixed(1),
        lastAnomaly: Math.max(...anomalies.map(a => new Date(a.cycle_started_at).getTime()))
      }))
      .sort((a, b) => b.lastAnomaly - a.lastAnomaly);
    
    // Anomaly trends
    const anomalyTrends = _.groupBy(data, 'dateStr');
    const anomalyTrendData = Object.entries(anomalyTrends).map(([date, records]) => ({
      date: date.split('/')[0] + '/' + date.split('/')[1],
      anomalies: records.filter(r => r.anomaly).length,
      avgScore: (_.meanBy(records, 'health_anomaly_score') * 100) || 0
    })).slice(-7);
    
    return {
      anomalyCount,
      avgAnomalyScore: (avgAnomalyScore * 100).toFixed(1),
      highAnomalyMachines: highAnomalyMachines.slice(0, 5),
      anomalyTrendData
    };
  }, [data]);

  // EOL Planning & Maintenance
  const eolMetrics = useMemo(() => {
    if (!data.length) return {};
    
    const machineData = _.groupBy(data, 'device_id');
    const eolData = Object.entries(machineData).map(([device, records]) => {
      const lifetimeCycles = records.length * 52; // Extrapolate to yearly
      const eolThreshold = 50000;
      const remainingLife = Math.max(0, ((eolThreshold - lifetimeCycles) / eolThreshold * 100));
      const errorCount = records.filter(r => r.e_stop || r.overload).length;
      const runtime = _.sumBy(records, 'runtime_hours') || 0;
      const mtbf = errorCount > 0 ? runtime / errorCount : runtime;
      const mttr = errorCount > 0 ? 2.5 : 0; // Estimated average repair time
      
      return {
        device,
        lifetimeCycles,
        remainingLife: remainingLife.toFixed(1),
        mtbf: mtbf.toFixed(1),
        mttr: mttr.toFixed(1),
        isNearEOL: remainingLife < 10 || (_.meanBy(records, 'health_anomaly_score') || 0) > 0.7
      };
    }).sort((a, b) => parseFloat(a.remainingLife) - parseFloat(b.remainingLife));
    
    const avgMTBF = _.meanBy(eolData, d => parseFloat(d.mtbf)) || 0;
    const avgMTTR = _.meanBy(eolData, d => parseFloat(d.mttr)) || 0;
    const eolMachines = eolData.filter(d => d.isNearEOL);
    
    return {
      avgMTBF: avgMTBF.toFixed(1),
      avgMTTR: avgMTTR.toFixed(1),
      eolMachines: eolMachines.slice(0, 5),
      avgRemainingLife: (_.meanBy(eolData, d => parseFloat(d.remainingLife)) || 0).toFixed(1),
      totalMachines: eolData.length
    };
  }, [data]);

  // Machine Rankings
  const machineRankings = useMemo(() => {
    if (!data.length) return { top5: [], bottom5: [] };
    
    const grouped = _.groupBy(data, 'device_id');
    const machines = Object.entries(grouped).map(([device, records]) => {
      const runtime = _.sumBy(records, 'runtime_hours') || 0;
      const errors = records.filter(r => r.e_stop || r.overload).length;
      const efficiency = errors > 0 ? runtime / errors : runtime;
      
      return {
        device,
        runtime: runtime.toFixed(1),
        cycles: records.length,
        energy: (_.sumBy(records, 'energy_active_kwh') || 0).toFixed(1),
        errors,
        efficiency: efficiency.toFixed(1),
        utilization: ((runtime / (7 * 24)) * 100).toFixed(1),
        status: errors > 0 ? 'Warning' : 'Healthy'
      };
    }).sort((a, b) => parseFloat(b.runtime) - parseFloat(a.runtime));
    
    return {
      top5: machines.slice(0, 5),
      bottom5: machines.slice(-5).reverse()
    };
  }, [data]);

  // Utilization Heatmap Data
  const heatmapData = useMemo(() => {
    if (!data.length) return { days: [], hours: [], data: [] };
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const heatmap = {};
    
    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        heatmap[`${dayIndex}-${hour}`] = 0;
      });
    });
    
    data.forEach(record => {
      const key = `${record.dayOfWeek}-${record.hour}`;
      heatmap[key] += record.runtime_hours;
    });
    
    const maxValue = Math.max(...Object.values(heatmap));
    const heatmapArray = [];
    
    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        const value = heatmap[`${dayIndex}-${hour}`];
        heatmapArray.push({
          day: dayIndex,
          hour,
          dayName: day,
          value,
          intensity: maxValue > 0 ? (value / maxValue) * 100 : 0
        });
      });
    });
    
    return { days, hours, data: heatmapArray };
  }, [data]);

  const uniqueDevices = useMemo(() => {
    return _.uniqBy(originalData, 'device_id').map(d => d.device_id).sort();
  }, [originalData]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: theme.bg }}>
        <div className="text-center p-8 rounded-2xl backdrop-blur-lg" style={{ 
          background: theme.glass,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadows.lg
        }}>
          <div className="relative mb-6">
            <div className="animate-spin rounded-full h-20 w-20 mx-auto" style={{ 
              background: theme.gradients.primary,
              mask: 'radial-gradient(transparent 30%, black 31%)',
              WebkitMask: 'radial-gradient(transparent 30%, black 31%)'
            }}></div>
            <Activity className="absolute top-6 left-1/2 transform -translate-x-1/2 w-8 h-8" style={{ color: theme.colors.primary }} />
          </div>
          <div className="text-xl font-semibold mb-2" style={{ color: theme.text.primary }}>
            Processing Telemetry Data
          </div>
          <div className="text-sm" style={{ color: theme.text.muted }}>
            Analyzing industrial metrics and performance indicators...
          </div>
        </div>
      </div>
    );
  }

  if (!loading && originalData.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center p-4" style={{ background: theme.bg }}>
        <div className="text-center p-12 rounded-2xl backdrop-blur-lg max-w-md mx-auto" style={{ 
          background: theme.glass,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadows.lg
        }}>
          <div className="p-6 rounded-full mb-8 mx-auto w-fit" style={{ background: `${theme.colors.primary}20` }}>
            <Upload className="w-16 h-16" style={{ color: theme.colors.primary }} />
          </div>
          <h2 className="text-3xl font-bold mb-4" style={{ color: theme.text.primary }}>
            Upload Telemetry Data
          </h2>
          <p className="text-lg mb-8" style={{ color: theme.text.secondary }}>
            Import your CSV file to begin comprehensive fleet analysis
          </p>
          {errorMessage && (
            <div className="p-4 mb-6 rounded-xl backdrop-blur-lg" style={{ 
              background: `${theme.colors.danger}20`, 
              color: theme.colors.danger,
              border: `1px solid ${theme.colors.danger}40`
            }}>
              {errorMessage}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:scale-105"
            style={{ 
              background: theme.gradients.primary,
              boxShadow: theme.shadows.md
            }}
          >
            Choose CSV File
          </button>
        </div>
      </div>
    );
  }

  const MetricCard = ({ title, value, unit, trend, subtitle, icon: Icon, gradient, size = 'normal' }) => (
    <div className={`rounded-xl backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] ${
      size === 'large' ? 'p-6' : 'p-4'
    }`} style={{ 
      background: theme.card,
      border: `1px solid ${theme.border}`,
      boxShadow: theme.shadows.md
    }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className={`font-semibold uppercase tracking-wider mb-1 ${
            size === 'large' ? 'text-sm' : 'text-xs'
          }`} style={{ color: theme.text.muted }}>
            {title}
          </div>
          {subtitle && (
            <div className="text-xs opacity-75" style={{ color: theme.text.muted }}>
              {subtitle}
            </div>
          )}
        </div>
        {Icon && (
          <div className="p-3 rounded-xl transition-all duration-300 hover:scale-110" style={{ 
            background: gradient || `${theme.colors.primary}20`
          }}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className={`font-bold ${
          size === 'large' ? 'text-4xl' : 'text-2xl'
        }`} style={{ color: theme.text.primary }}>{value}</span>
        {unit && <span className="text-lg font-medium" style={{ color: theme.text.secondary }}>{unit}</span>}
      </div>
      {trend !== undefined && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-3 py-1 rounded-full" style={{
            background: trend > 0 ? `${theme.colors.success}20` : `${theme.colors.danger}20`
          }}>
            {trend > 0 ? 
              <TrendingUp className="w-4 h-4" style={{ color: theme.colors.success }} /> : 
              <TrendingDown className="w-4 h-4" style={{ color: theme.colors.danger }} />
            }
            <span className="text-sm font-semibold" style={{ 
              color: trend > 0 ? theme.colors.success : theme.colors.danger 
            }}>
              {Math.abs(trend)}%
            </span>
          </div>
          <span className="text-sm" style={{ color: theme.text.muted }}>vs last period</span>
        </div>
      )}
    </div>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="p-4 rounded-xl backdrop-blur-lg max-w-xs" style={{ 
          background: theme.card,
          border: `1px solid ${theme.border}`,
          boxShadow: theme.shadows.lg
        }}>
          <p className="text-sm font-semibold mb-3" style={{ color: theme.text.primary }}>{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-3 text-sm mb-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span style={{ color: theme.text.secondary }}>{entry.name}:</span>
              <span className="font-semibold ml-auto" style={{ color: theme.text.primary }}>{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: theme.bg }}>
      {/* Enhanced Header */}
      <div className="flex items-center justify-between px-6 py-4 backdrop-blur-lg flex-shrink-0" style={{ 
        background: theme.glass,
        borderBottom: `1px solid ${theme.border}`,
        boxShadow: theme.shadows.sm
      }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl" style={{ background: theme.gradients.primary }}>
              <Activity className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: theme.text.primary }}>
                Industrial Telemetry Dashboard
              </h1>
              <p className="text-sm" style={{ color: theme.text.muted }}>
                Comprehensive fleet monitoring & predictive analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-lg" style={{
              background: `${theme.colors.primary}20`,
              border: `1px solid ${theme.colors.primary}40`
            }}>
              <Database className="w-4 h-4" style={{ color: theme.colors.primary }} />
              <span className="text-sm font-semibold" style={{ color: theme.colors.primary }}>
                {data.length} records
              </span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-lg" style={{
              background: `${theme.colors.success}20`,
              border: `1px solid ${theme.colors.success}40`
            }}>
              <Wifi className="w-4 h-4" style={{ color: theme.colors.success }} />
              <span className="text-sm font-semibold" style={{ color: theme.colors.success }}>
                {fleetMetrics.uniqueDevices} devices online
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="px-6 py-3 rounded-xl flex items-center gap-3 font-semibold text-white transition-all duration-300 hover:scale-105" 
            style={{ 
              background: theme.gradients.primary,
              boxShadow: theme.shadows.md
            }}
          >
            <Upload className="w-5 h-5" />
            Upload Data
          </button>
          
          <select 
            value={selectedTimeRange} 
            onChange={(e) => setSelectedTimeRange(e.target.value)} 
            className="px-4 py-3 rounded-xl font-medium transition-all duration-300 backdrop-blur-lg" 
            style={{ 
              background: theme.card,
              color: theme.text.primary, 
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.sm
            }}
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
          
          <select 
            value={selectedDevice} 
            onChange={(e) => setSelectedDevice(e.target.value)} 
            className="px-4 py-3 rounded-xl font-medium transition-all duration-300 backdrop-blur-lg" 
            style={{ 
              background: theme.card,
              color: theme.text.primary, 
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.sm
            }}
          >
            <option value="all">All Devices</option>
            {uniqueDevices.map(device => (
              <option key={device} value={device}>{device}</option>
            ))}
          </select>
          
          <button 
            onClick={loadData} 
            className="p-3 rounded-xl transition-all duration-300 hover:scale-105 backdrop-blur-lg" 
            style={{ 
              background: theme.card,
              color: theme.text.secondary,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.sm
            }}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-12 gap-6 h-full">
          
          {/* Section 1: Fleet Overview KPIs */}
          <div className="col-span-12 mb-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Target className="w-6 h-6" style={{ color: theme.colors.primary }} />
              Fleet Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
              <MetricCard 
                title="Total Runtime" 
                subtitle="Sum(cycle_duration_ms)÷3600" 
                value={fleetMetrics.totalRuntime} 
                unit="hrs" 
                trend={5.2} 
                icon={Clock}
                gradient={theme.gradients.primary}
              />
              <MetricCard 
                title="Utilization Rate" 
                subtitle="Runtime÷(Window×Machines)" 
                value={fleetMetrics.utilizationRate} 
                unit="%" 
                trend={-2.1} 
                icon={Gauge}
                gradient={theme.gradients.success}
              />
              <MetricCard 
                title="Total Cycles" 
                subtitle="Count of completed cycles" 
                value={fleetMetrics.totalCycles} 
                trend={8.3} 
                icon={Activity}
                gradient={theme.gradients.teal}
              />
              <MetricCard 
                title="Error Incidents" 
                subtitle="E-stops + Overloads" 
                value={fleetMetrics.errorCount} 
                trend={-12.5} 
                icon={AlertTriangle}
                gradient={theme.gradients.danger}
              />
              <MetricCard 
                title="Avg Cycles/Machine" 
                subtitle="Workload balance indicator" 
                value={fleetMetrics.avgCyclesPerMachine}
                icon={BarChart3}
                gradient={theme.gradients.warning}
              />
              <MetricCard 
                title="Total Energy" 
                subtitle="Sum(energy_active_kwh)" 
                value={fleetMetrics.totalEnergy}
                unit="kWh"
                icon={Zap}
                gradient={theme.gradients.purple}
              />
              <MetricCard 
                title="Bales Produced" 
                subtitle="Sum(bale_count_increment)" 
                value={fleetMetrics.totalBales}
                icon={Box}
                gradient={theme.gradients.teal}
              />
              <MetricCard 
                title="Active Devices" 
                subtitle="Devices reporting data" 
                value={fleetMetrics.uniqueDevices}
                icon={Wifi}
                gradient={theme.gradients.success}
              />
            </div>
          </div>

          {/* Section 2: Performance Analytics */}
          <div className="col-span-8">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <BarChart3 className="w-6 h-6" style={{ color: theme.colors.success }} />
              Performance Analytics
            </h2>
            
            {/* Performance Trends Chart - Split into two charts for better visibility */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Cycles and Runtime Chart */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md,
                height: '400px'
              }}>
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-2" style={{ color: theme.text.primary }}>
                    Daily Cycles & Runtime
                  </h3>
                  <p className="text-sm" style={{ color: theme.text.muted }}>
                    Daily cycle counts (bars) and total runtime hours (line) - both metrics use similar scales
                  </p>
                </div>
                <ResponsiveContainer width="100%" height="80%">
                  <ComposedChart data={usageMetrics.performanceTrends} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <defs>
                      <linearGradient id="cyclesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis 
                      dataKey="date" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Date', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <YAxis 
                      yAxisId="left" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Cycle Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Runtime Hours', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ color: theme.text.secondary, fontSize: '12px', paddingTop: '15px' }}
                      iconType="line"
                    />
                    <Bar yAxisId="left" dataKey="cycles" fill="url(#cyclesGradient)" radius={[4, 4, 0, 0]} name="Daily Cycles" />
                    <Line yAxisId="right" type="monotone" dataKey="runtime" stroke={theme.colors.success} strokeWidth={3} dot={{ r: 5, fill: theme.colors.success }} name="Runtime (hrs)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Energy Consumption Chart */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md,
                height: '400px'
              }}>
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-2" style={{ color: theme.text.primary }}>
                    Energy Consumption & Efficiency
                  </h3>
                  <p className="text-sm" style={{ color: theme.text.muted }}>
                    Daily energy consumption (kWh) and bales produced showing operational efficiency
                  </p>
                </div>
                <ResponsiveContainer width="100%" height="80%">
                  <ComposedChart data={usageMetrics.performanceTrends} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <defs>
                      <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.colors.warning} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={theme.colors.warning} stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis 
                      dataKey="date" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Date', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <YAxis 
                      yAxisId="left" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      stroke={theme.text.muted} 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Bales Produced', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: theme.text.muted } }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ color: theme.text.secondary, fontSize: '12px', paddingTop: '15px' }}
                      iconType="line"
                    />
                    <Area yAxisId="left" dataKey="energy" fill="url(#energyGradient)" stroke={theme.colors.warning} strokeWidth={2} name="Energy (kWh)" />
                    <Line yAxisId="right" type="monotone" dataKey="bales" stroke={theme.colors.teal} strokeWidth={3} dot={{ r: 5, fill: theme.colors.teal }} name="Bales Produced" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Machine Health Trends */}
            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
              background: theme.card,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.md,
              height: '400px'
            }}>
              <div className="mb-4">
                <h3 className="text-lg font-bold mb-2" style={{ color: theme.text.primary }}>
                  Machine Health Trends
                </h3>
                <p className="text-sm" style={{ color: theme.text.muted }}>
                  Key health indicators showing electrical imbalance, hydraulic pressure stability, and cycle time performance over time
                </p>
              </div>
              <ResponsiveContainer width="100%" height="85%">
                <LineChart data={healthMetrics.trendData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis 
                    dataKey="date" 
                    stroke={theme.text.muted} 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Date', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fill: theme.text.muted } }}
                  />
                  <YAxis 
                    stroke={theme.text.muted} 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Health Metrics (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: theme.text.muted } }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ color: theme.text.secondary, fontSize: '12px', paddingTop: '20px' }}
                    iconType="line"
                  />
                  <Line type="monotone" dataKey="currentImbalance" stroke={theme.colors.danger} strokeWidth={3} dot={{ r: 5 }} name="Current Imbalance %" />
                  <Line type="monotone" dataKey="pressureOvershoot" stroke={theme.colors.warning} strokeWidth={3} dot={{ r: 5 }} name="Pressure Overshoot %" />
                  <Line type="monotone" dataKey="cycleTimeDrift" stroke={theme.colors.purple} strokeWidth={3} dot={{ r: 5 }} name="Cycle Time Drift %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Section 3: Machine Rankings & Status */}
          <div className="col-span-4">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Users className="w-6 h-6" style={{ color: theme.colors.teal }} />
              Machine Rankings
            </h2>

            {/* Top Performers */}
            <div className="rounded-xl p-6 mb-4 backdrop-blur-lg" style={{ 
              background: theme.card,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.md
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg" style={{ background: `${theme.colors.success}20` }}>
                  <ChevronUp className="w-5 h-5" style={{ color: theme.colors.success }} />
                </div>
                <span className="text-lg font-bold" style={{ color: theme.text.primary }}>Top Performers</span>
              </div>
              <div className="space-y-3">
                {machineRankings.top5.map((machine, idx) => (
                  <div key={machine.device} className="flex items-center justify-between p-4 rounded-lg transition-all duration-300 hover:scale-[1.02]" 
                    style={{ background: theme.glass }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ 
                        background: theme.gradients.success,
                        color: 'white'
                      }}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: theme.text.primary }}>
                          {machine.device.slice(-10)}
                        </div>
                        <div className="text-xs" style={{ color: theme.text.muted }}>
                          {machine.cycles} cycles
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: theme.colors.success }}>
                        {machine.runtime}h
                      </div>
                      <div className="text-xs" style={{ color: theme.text.muted }}>
                        {machine.utilization}% util
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Attention Needed */}
            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
              background: theme.card,
              border: `1px solid ${theme.border}`,
              boxShadow: theme.shadows.md
            }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg" style={{ background: `${theme.colors.warning}20` }}>
                  <ChevronDown className="w-5 h-5" style={{ color: theme.colors.warning }} />
                </div>
                <span className="text-lg font-bold" style={{ color: theme.text.primary }}>Attention Needed</span>
              </div>
              <div className="space-y-3">
                {machineRankings.bottom5.map((machine, idx) => (
                  <div key={machine.device} className="flex items-center justify-between p-4 rounded-lg transition-all duration-300 hover:scale-[1.02]" 
                    style={{ background: theme.glass }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ 
                        background: theme.gradients.warning,
                        color: 'white'
                      }}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: theme.text.primary }}>
                          {machine.device.slice(-10)}
                        </div>
                        <div className="text-xs" style={{ color: theme.text.muted }}>
                          {machine.errors} errors
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold" style={{ color: theme.colors.warning }}>
                        {machine.runtime}h
                      </div>
                      <div className="text-xs" style={{ color: theme.text.muted }}>
                        {machine.utilization}% util
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Safety & Health Monitoring */}
          <div className="col-span-12 mt-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Shield className="w-6 h-6" style={{ color: theme.colors.danger }} />
              Safety & Health Monitoring
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              {/* Safety Metrics */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Safety Dashboard</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.danger}15` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: theme.colors.danger }}>E-STOP ACTIVATIONS</div>
                    <div className="text-3xl font-bold" style={{ color: theme.colors.danger }}>{safetyMetrics.eStopCount}</div>
                  </div>
                  <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.orange}15` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: theme.colors.orange }}>OVERLOAD TRIPS</div>
                    <div className="text-3xl font-bold" style={{ color: theme.colors.orange }}>{safetyMetrics.overloadCount}</div>
                  </div>
                  <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.warning}15` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: theme.colors.warning }}>DOOR/GATE VIOLATIONS</div>
                    <div className="text-3xl font-bold" style={{ color: theme.colors.warning }}>{safetyMetrics.doorGateViolations}</div>
                  </div>
                  <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.purple}15` }}>
                    <div className="text-xs font-semibold mb-2" style={{ color: theme.colors.purple }}>VALVE ISSUES</div>
                    <div className="text-3xl font-bold" style={{ color: theme.colors.purple }}>{safetyMetrics.valveIssues}</div>
                  </div>
                </div>
              </div>

              {/* Error Trends Chart */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <div className="mb-4">
                  <h3 className="text-lg font-bold mb-2" style={{ color: theme.text.primary }}>Error Trends Over Time</h3>
                  <p className="text-sm" style={{ color: theme.text.muted }}>
                    Daily safety incident tracking: E-stops, overloads, door/gate violations, and valve failures
                  </p>
                </div>
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={safetyMetrics.errorTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                      <XAxis 
                        dataKey="date" 
                        stroke={theme.text.muted} 
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: theme.text.muted, fontSize: '10px' } }}
                      />
                      <YAxis 
                        stroke={theme.text.muted} 
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Error Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: theme.text.muted, fontSize: '10px' } }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        wrapperStyle={{ color: theme.text.secondary, fontSize: '11px', paddingTop: '10px' }}
                        iconType="line"
                      />
                      <Line type="monotone" dataKey="eStops" stroke={theme.colors.danger} strokeWidth={2} dot={{ r: 3 }} name="E-Stops" />
                      <Line type="monotone" dataKey="overloads" stroke={theme.colors.orange} strokeWidth={2} dot={{ r: 3 }} name="Overloads" />
                      <Line type="monotone" dataKey="doorGate" stroke={theme.colors.warning} strokeWidth={2} dot={{ r: 3 }} name="Door/Gate" />
                      <Line type="monotone" dataKey="valveIssues" stroke={theme.colors.purple} strokeWidth={2} dot={{ r: 3 }} name="Valve Issues" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Health Metrics */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Health Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: theme.glass }}>
                    <span className="text-sm font-medium" style={{ color: theme.text.secondary }}>Current Imbalance</span>
                    <span className="text-lg font-bold" style={{ color: theme.text.primary }}>{healthMetrics.avgCurrentImbalance}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: theme.glass }}>
                    <span className="text-sm font-medium" style={{ color: theme.text.secondary }}>Pressure Overshoot</span>
                    <span className="text-lg font-bold" style={{ color: theme.text.primary }}>{healthMetrics.avgPressureOvershoot}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: theme.glass }}>
                    <span className="text-sm font-medium" style={{ color: theme.text.secondary }}>Cycle Time Drift</span>
                    <span className="text-lg font-bold" style={{ color: theme.text.primary }}>{healthMetrics.cycleTimeDrift}%</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg" style={{ background: theme.glass }}>
                    <span className="text-sm font-medium" style={{ color: theme.text.secondary }}>Energy per Cycle</span>
                    <span className="text-lg font-bold" style={{ color: theme.text.primary }}>{healthMetrics.avgEnergyPerCycle} kWh</span>
                  </div>
                </div>
              </div>

              {/* Anomaly Detection with Trends */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Anomaly Analysis</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="text-center p-3 rounded-xl" style={{ background: theme.glass }}>
                    <div className="text-2xl font-bold" style={{ color: theme.colors.danger }}>{anomalyMetrics.avgAnomalyScore}%</div>
                    <div className="text-xs font-semibold" style={{ color: theme.text.secondary }}>AVG SCORE</div>
                  </div>
                  <div className="text-center p-3 rounded-xl" style={{ background: theme.glass }}>
                    <div className="text-2xl font-bold" style={{ color: theme.colors.orange }}>{anomalyMetrics.anomalyCount}</div>
                    <div className="text-xs font-semibold" style={{ color: theme.text.secondary }}>DETECTED</div>
                  </div>
                </div>
                
                {/* Mini Anomaly Trend Chart */}
                <div style={{ height: '120px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={anomalyMetrics.anomalyTrendData} margin={{ top: 5, right: 5, left: 5, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                      <XAxis 
                        dataKey="date" 
                        stroke={theme.text.muted} 
                        tick={{ fontSize: 9 }}
                        label={{ value: 'Date', position: 'insideBottom', offset: -5, style: { textAnchor: 'middle', fill: theme.text.muted, fontSize: '8px' } }}
                      />
                      <YAxis 
                        stroke={theme.text.muted} 
                        tick={{ fontSize: 9 }}
                        label={{ value: 'Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: theme.text.muted, fontSize: '8px' } }}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="anomalies" stroke={theme.colors.danger} strokeWidth={2} dot={{ r: 2 }} name="Anomaly Count" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                {anomalyMetrics.highAnomalyMachines?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold mb-2" style={{ color: theme.colors.danger }}>⚠️ High Risk Machines</div>
                    <div className="space-y-1">
                      {anomalyMetrics.highAnomalyMachines.slice(0, 2).map(machine => (
                        <div key={machine.device} className="flex justify-between text-xs p-2 rounded-lg" style={{ 
                          background: `${theme.colors.danger}20`,
                          border: `1px solid ${theme.colors.danger}40`
                        }}>
                          <span style={{ color: theme.text.primary }}>{machine.device.slice(-8)}</span>
                          <span style={{ color: theme.colors.danger }}>{machine.anomalyCount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Operational Analysis */}
          <div className="col-span-12 mt-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Cpu className="w-6 h-6" style={{ color: theme.colors.purple }} />
              Operational Analysis
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Utilization Heatmap */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold" style={{ color: theme.text.primary }}>
                    Utilization Heatmap (Hour × Day)
                  </h3>
                  <div className="flex items-center gap-2 text-xs" style={{ color: theme.text.muted }}>
                    <span>Low</span>
                    <div className="flex gap-1">
                      <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 0.3 }}></div>
                      <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 0.6 }}></div>
                      <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 1.0 }}></div>
                    </div>
                    <span>High</span>
                  </div>
                </div>
                <div style={{ height: '300px' }}>
                  <div className="grid gap-1 h-full" style={{ 
                    gridTemplateColumns: 'auto repeat(24, 1fr)',
                    gridTemplateRows: 'auto repeat(7, 1fr)',
                    fontSize: '10px'
                  }}>
                    {/* Header */}
                    <div></div>
                    {heatmapData.hours.map(h => (
                      <div key={h} className="text-center font-medium flex items-center justify-center" style={{ color: theme.text.muted }}>
                        {h % 4 === 0 ? h : ''}
                      </div>
                    ))}
                    {/* Data */}
                    {heatmapData.days.map((day, dayIdx) => (
                      <React.Fragment key={dayIdx}>
                        <div className="font-semibold flex items-center justify-center" style={{ color: theme.text.muted }}>{day}</div>
                        {heatmapData.hours.map(hour => {
                          const cell = heatmapData.data.find(d => d.day === dayIdx && d.hour === hour);
                          const intensity = cell ? cell.intensity : 0;
                          const opacity = intensity / 100;
                          return (
                            <div key={`${dayIdx}-${hour}`} 
                              className="rounded transition-all duration-300 hover:scale-110 cursor-pointer" 
                              style={{
                                background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.teal})`,
                                opacity: opacity > 0 ? (0.3 + opacity * 0.7) : 0.1
                              }}
                              title={`${day} ${hour}:00 - ${cell?.value.toFixed(1) || 0} hrs`}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>

              {/* Idle vs Active Time */}
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>
                  Machine Utilization Analysis
                </h3>
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={usageMetrics.idleActiveData.slice(0, 6)} layout="horizontal" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                      <XAxis type="number" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="device" stroke={theme.text.muted} tick={{ fontSize: 10 }} width={55} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend 
                        wrapperStyle={{ color: theme.text.secondary, fontSize: '12px', paddingTop: '15px' }}
                        iconType="rect"
                      />
                      <Bar dataKey="activeTime" stackId="a" fill={theme.colors.success} name="Active Time (hrs)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="idleTime" stackId="a" fill={theme.colors.danger} name="Idle Time (hrs)" radius={[4, 0, 0, 4]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Section 6: Maintenance & EOL Planning */}
          <div className="col-span-12 mt-6">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Wrench className="w-6 h-6" style={{ color: theme.colors.warning }} />
              Maintenance & EOL Planning
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              
              <MetricCard 
                title="Mean Time Between Failures" 
                subtitle="MTBF (hours)" 
                value={eolMetrics.avgMTBF} 
                unit="hrs"
                icon={Timer}
                gradient={theme.gradients.teal}
                size="large"
              />
              
              <MetricCard 
                title="Mean Time To Repair" 
                subtitle="MTTR (hours)" 
                value={eolMetrics.avgMTTR} 
                unit="hrs"
                icon={Wrench}
                gradient={theme.gradients.warning}
                size="large"
              />
              
              <MetricCard 
                title="Average Remaining Life" 
                subtitle="Fleet EOL estimate" 
                value={eolMetrics.avgRemainingLife} 
                unit="%"
                icon={Battery}
                gradient={theme.gradients.success}
                size="large"
              />
              
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ 
                background: theme.card,
                border: `1px solid ${theme.border}`,
                boxShadow: theme.shadows.md
              }}>
                <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>EOL Alert Machines</h3>
                {eolMetrics.eolMachines?.length > 0 ? (
                  <div className="space-y-3">
                    {eolMetrics.eolMachines.slice(0, 4).map(machine => (
                      <div key={machine.device} className="flex justify-between text-sm p-3 rounded-lg" style={{ 
                        background: `${theme.colors.warning}20`,
                        border: `1px solid ${theme.colors.warning}40`
                      }}>
                        <span style={{ color: theme.text.primary }}>{machine.device.slice(-10)}</span>
                        <span style={{ color: theme.colors.warning }}>{machine.remainingLife}% life</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-sm" style={{ color: theme.colors.success }}>✓ All machines operating within normal parameters</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;