import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, ScatterChart, Scatter, RadialBarChart, RadialBar } from 'recharts';
import { Activity, AlertTriangle, Cpu, TrendingUp, TrendingDown, Zap, Shield, Clock, BarChart3, Gauge, AlertCircle, CheckCircle, XCircle, Upload, Calendar, MapPin, RefreshCw, Users, Box } from 'lucide-react';
import Papa from 'papaparse';
import _ from 'lodash';

const Dashboard = () => {
  const [data, setData] = useState([]);
  const [originalData, setOriginalData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [hoveredDevice, setHoveredDevice] = useState(null);
  const [animatedValues, setAnimatedValues] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef(null);

  // Color scheme
  const colors = {
    primary: '#0ea5e9',     // Sky blue
    secondary: '#8b5cf6',   // Purple
    success: '#10b981',     // Emerald
    warning: '#f59e0b',     // Amber
    danger: '#ef4444',      // Red
    dark: '#0f172a',        // Dark slate
    cardBg: 'rgba(15, 23, 42, 0.6)',
    borderColor: 'rgba(148, 163, 184, 0.1)'
  };

  useEffect(() => {
    const initializeData = async () => {
      if (!window.fs || !window.fs.readFile) {
        console.error('File system API not available');
        setErrorMessage('Please upload a CSV file using the upload button.');
        setLoading(false);
        return;
      }
      loadData();
    };
    initializeData();
  }, []);

  useEffect(() => {
    if (!loading && data.length > 0) {
      const timer = setTimeout(() => {
        setAnimatedValues({ loaded: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, data]);

  useEffect(() => {
    applyFilters();
  }, [selectedDevice, selectedLocation, selectedTimeRange, originalData]);

  const applyFilters = () => {
    if (!originalData.length) return;
    
    let filtered = [...originalData];
    
    if (selectedDevice !== 'all') {
      filtered = filtered.filter(d => d.device_id === selectedDevice);
    }
    
    if (selectedLocation !== 'all') {
      filtered = filtered.filter(d => d.location === selectedLocation);
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
      setErrorMessage('Failed to read file. Please ensure it is a valid CSV file.');
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
        throw new Error('The CSV file is empty or could not be parsed');
      }
      
      const requiredColumns = ['device_id', 'cycle_started_at', 'cycle_duration_ms'];
      const columns = Object.keys(parsed.data[0] || {});
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
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
        anomaly: row.health_anomaly_score > 0.5,
        attention: row.health_attention_flag === 'True' || row.health_attention_flag === true
      })).filter(row => !isNaN(row.date.getTime()));
      
      if (processedData.length === 0) {
        throw new Error('No valid data rows found after processing');
      }
      
      setOriginalData(processedData);
      setData(processedData);
      console.log(`Successfully loaded ${processedData.length} rows of telemetry data`);
      setLoading(false);
      setErrorMessage('');
      
    } catch (error) {
      console.error('Error processing CSV:', error);
      setErrorMessage(error.message || 'Failed to process CSV data');
      setData([]);
      setOriginalData([]);
      setLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setErrorMessage('');
    
    try {
      if (!window.fs || !window.fs.readFile) {
        throw new Error('Please upload a CSV file using the upload button above.');
      }
      
      let csvContent;
      let fileFound = false;
      
      try {
        csvContent = await window.fs.readFile('multi_device_telemetry_7days.csv', { encoding: 'utf8' });
        fileFound = true;
        console.log('Successfully loaded: multi_device_telemetry_7days.csv');
      } catch (mainFileError) {
        console.log('Main file not found, trying alternatives...');
        
        const alternativeNames = ['telemetry.csv', 'data.csv', 'telemetry_data.csv', 'device_telemetry.csv'];
        
        for (const fileName of alternativeNames) {
          try {
            csvContent = await window.fs.readFile(fileName, { encoding: 'utf8' });
            fileFound = true;
            console.log(`Successfully loaded: ${fileName}`);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!fileFound || !csvContent) {
        throw new Error('No telemetry data file found. Please upload your CSV file using the upload button.');
      }
      
      processCSVData(csvContent);
      
    } catch (error) {
      console.error('Error loading data:', error);
      setErrorMessage(error.message || 'Failed to load telemetry data');
      setData([]);
      setOriginalData([]);
      setLoading(false);
    }
  };

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!data.length) return {};
    
    const totalRuntime = _.sumBy(data, 'runtime_hours');
    const totalCycles = data.length;
    const totalEnergy = _.sumBy(data, 'energy_active_kwh');
    const totalBales = _.sumBy(data, 'productivity_bale_count_increment');
    
    const uniqueDevices = _.uniqBy(data, 'device_id').length;
    
    let hoursInWindow;
    const latestDate = new Date(Math.max(...data.map(d => new Date(d.cycle_started_at))));
    const earliestDate = new Date(Math.min(...data.map(d => new Date(d.cycle_started_at))));
    const actualHours = (latestDate - earliestDate) / (1000 * 60 * 60);
    hoursInWindow = Math.max(actualHours, 1);
    
    const utilizationRate = (totalRuntime / (uniqueDevices * hoursInWindow)) * 100;
    const errorCount = data.filter(d => d.e_stop || d.overload).length;
    const anomalyCount = data.filter(d => d.anomaly).length;
    const avgCycleTime = _.meanBy(data, 'cycle_duration_ms') / 1000 / 60;
    const avgPressure = _.meanBy(data, 'hydraulic_avg_pressure_psi');
    const avgEnergyPerCycle = _.meanBy(data, 'energy_per_cycle_kwh');
    
    return {
      totalRuntime: totalRuntime.toFixed(1),
      totalCycles,
      totalEnergy: totalEnergy.toFixed(1),
      totalBales,
      utilizationRate: Math.min(utilizationRate, 100).toFixed(1),
      errorCount,
      anomalyCount,
      avgCycleTime: avgCycleTime.toFixed(1),
      avgPressure: avgPressure.toFixed(0),
      avgEnergyPerCycle: avgEnergyPerCycle.toFixed(2),
      deviceCount: uniqueDevices,
      errorRate: totalCycles > 0 ? ((errorCount / totalCycles) * 100).toFixed(1) : '0',
      anomalyRate: totalCycles > 0 ? ((anomalyCount / totalCycles) * 100).toFixed(1) : '0'
    };
  }, [data]);

  const uniqueDevices = useMemo(() => {
    return _.uniqBy(originalData, 'device_id').map(d => d.device_id).sort();
  }, [originalData]);

  const uniqueLocations = useMemo(() => {
    return _.uniq(originalData.map(d => d.location)).sort();
  }, [originalData]);

  const machinePerformance = useMemo(() => {
    if (!data.length) return [];
    
    const grouped = _.groupBy(data, 'device_id');
    return Object.entries(grouped).map(([device, records]) => ({
      device,
      runtime: _.sumBy(records, 'runtime_hours').toFixed(1),
      cycles: records.length,
      energy: _.sumBy(records, 'energy_active_kwh').toFixed(1),
      bales: _.sumBy(records, 'productivity_bale_count_increment'),
      errors: records.filter(r => r.e_stop || r.overload).length,
      avgAnomalyScore: _.meanBy(records, 'health_anomaly_score').toFixed(3),
      utilization: ((_.sumBy(records, 'runtime_hours') / (7 * 24)) * 100).toFixed(1),
      location: records[0].location,
      status: parseFloat(_.meanBy(records, 'health_anomaly_score')) > 0.5 ? 'Critical' : 
              records.filter(r => r.e_stop || r.overload).length > 0 ? 'Warning' : 'Healthy'
    })).sort((a, b) => parseFloat(b.runtime) - parseFloat(a.runtime));
  }, [data]);

  const timeSeriesData = useMemo(() => {
    if (!data.length) return [];
    
    const grouped = _.groupBy(data, 'dateStr');
    return Object.entries(grouped).map(([date, records]) => ({
      date: date.split('/')[1],
      cycles: records.length,
      energy: _.sumBy(records, 'energy_active_kwh').toFixed(1),
      runtime: _.sumBy(records, 'runtime_hours').toFixed(1),
      errors: records.filter(r => r.e_stop || r.overload).length
    }));
  }, [data]);

  const heatmapData = useMemo(() => {
    if (!data.length) return [];
    
    const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));
    data.forEach(record => {
      heatmap[record.dayOfWeek][record.hour] += record.runtime_hours;
    });
    
    const maxValue = Math.max(...heatmap.flat());
    const result = [];
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    for (let hour = 0; hour < 24; hour++) {
      const row = { hour };
      days.forEach((day, dayIndex) => {
        row[day] = heatmap[dayIndex][hour];
        row[`${day}_intensity`] = maxValue > 0 ? heatmap[dayIndex][hour] / maxValue : 0;
      });
      result.push(row);
    }
    
    return result;
  }, [data]);

  const errorDistribution = useMemo(() => {
    if (!data.length) return [];
    
    const eStops = data.filter(d => d.e_stop).length;
    const overloads = data.filter(d => d.overload).length;
    const doorEvents = _.sumBy(data, 'di_door_open_events');
    const gateEvents = _.sumBy(data, 'di_gate_open_events');
    const total = eStops + overloads + doorEvents + gateEvents;
    
    return [
      { name: 'E-Stop', value: eStops, percentage: total > 0 ? (eStops/total*100).toFixed(0) : 0 },
      { name: 'Overload', value: overloads, percentage: total > 0 ? (overloads/total*100).toFixed(0) : 0 },
      { name: 'Door', value: doorEvents, percentage: total > 0 ? (doorEvents/total*100).toFixed(0) : 0 },
      { name: 'Gate', value: gateEvents, percentage: total > 0 ? (gateEvents/total*100).toFixed(0) : 0 }
    ].filter(item => item.value > 0);
  }, [data]);

  if (loading) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <div className="text-white text-lg">Loading telemetry data...</div>
        </div>
      </div>
    );
  }

  if (!loading && originalData.length === 0) {
    return (
      <div className="h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700">
            <Upload className="w-12 h-12 text-sky-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Upload Telemetry Data</h2>
            {errorMessage && (
              <div className="bg-red-500/20 border border-red-500/50 rounded p-2 mb-4">
                <p className="text-red-400 text-sm">{errorMessage}</p>
              </div>
            )}
            <p className="text-slate-400 mb-6 text-sm">Upload your CSV file to start visualizing</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors"
            >
              Choose CSV File
            </button>
          </div>
        </div>
      </div>
    );
  }

  const CompactKPI = ({ icon: Icon, title, value, unit, color, trend }) => (
    <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2 hover:bg-slate-800/70 transition-all">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1">
          <Icon className="w-4 h-4" style={{ color }} />
          <span className="text-xs text-slate-400">{title}</span>
        </div>
        {trend !== undefined && (
          <span className={`text-xs ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-bold text-white">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );

  const MiniChart = ({ data, dataKey, color, height = 40 }) => (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#gradient-${dataKey})`} strokeWidth={1} />
      </AreaChart>
    </ResponsiveContainer>
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 p-2 rounded border border-slate-600 shadow-lg">
          <p className="text-white text-xs font-medium mb-1">{label}</p>
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
              <span className="text-slate-400">{entry.name}:</span>
              <span className="text-white font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-screen bg-slate-900 text-white overflow-hidden flex flex-col" style={{ maxHeight: '100vh' }}>
      {/* Header - Compact */}
      <div className="bg-slate-800/50 backdrop-blur border-b border-slate-700/50 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-500" />
              <h1 className="text-lg font-bold">Industrial Telemetry</h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{data.length} records</span>
              <span>•</span>
              <span>{kpis.deviceCount} devices</span>
              <span>•</span>
              <span>{uniqueLocations.length} sites</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 rounded text-xs flex items-center gap-1 transition-colors"
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
            
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs focus:outline-none focus:border-sky-500"
            >
              <option value="24h">24H</option>
              <option value="7d">7D</option>
              <option value="30d">30D</option>
              <option value="all">ALL</option>
            </select>
            
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Devices</option>
              {uniqueDevices.map(device => (
                <option key={device} value={device}>{device}</option>
              ))}
            </select>
            
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs focus:outline-none focus:border-sky-500"
            >
              <option value="all">All Sites</option>
              {uniqueLocations.map(location => (
                <option key={location} value={location}>{location.split(',')[0]}</option>
              ))}
            </select>
            
            <button
              onClick={() => loadData()}
              className="p-1 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="flex-1 p-2" style={{ overflow: 'hidden' }}>
        <div className="grid grid-cols-12 gap-2" style={{ height: '100%' }}>
          
          {/* Left Column - KPIs and Status */}
          <div className="col-span-3 flex flex-col gap-2" style={{ height: '100%' }}>
            
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2">
              <CompactKPI 
                icon={Clock} 
                title="Runtime" 
                value={kpis.totalRuntime} 
                unit="hrs" 
                color={colors.primary}
                trend={5.2}
              />
              <CompactKPI 
                icon={Gauge} 
                title="Utilization" 
                value={kpis.utilizationRate} 
                unit="%" 
                color={colors.secondary}
                trend={-2.1}
              />
              <CompactKPI 
                icon={Zap} 
                title="Energy" 
                value={kpis.totalEnergy} 
                unit="kWh" 
                color={colors.warning}
                trend={3.7}
              />
              <CompactKPI 
                icon={Box} 
                title="Cycles" 
                value={kpis.totalCycles} 
                unit="" 
                color={colors.success}
                trend={8.3}
              />
            </div>

            {/* Device Status Table */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ flex: '1 1 auto', minHeight: '120px' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Device Status</h3>
              <div className="space-y-1 overflow-auto" style={{ maxHeight: 'calc(100% - 20px)' }}>
                {machinePerformance.map(machine => (
                  <div key={machine.device} className="flex items-center justify-between p-2 bg-slate-700/30 rounded hover:bg-slate-700/50 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        machine.status === 'Critical' ? 'bg-red-500' : 
                        machine.status === 'Warning' ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      <span className="text-xs text-white">{machine.device}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-400">{machine.runtime}h</span>
                      <span className="text-xs text-slate-500">{machine.utilization}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Error Distribution */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ height: '180px' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Error Distribution</h3>
              <div style={{ height: '100px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={errorDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={25}
                      outerRadius={45}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {errorDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={[colors.danger, colors.warning, colors.primary, colors.secondary][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {errorDistribution.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: [colors.danger, colors.warning, colors.primary, colors.secondary][idx % 4] }} />
                    <span className="text-xs text-slate-400">{item.name}</span>
                    <span className="text-xs text-white ml-auto">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center Column - Main Charts */}
          <div className="col-span-6 flex flex-col gap-2" style={{ height: '100%' }}>
            
            {/* Performance Trend */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ height: '50%', minHeight: '200px' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Performance Trends</h3>
              <div style={{ height: 'calc(100% - 20px)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={timeSeriesData} margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.borderColor} />
                    <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar yAxisId="left" dataKey="cycles" fill={colors.primary} opacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="runtime" stroke={colors.success} strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="energy" stroke={colors.warning} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Row - Split Charts */}
            <div className="grid grid-cols-2 gap-2" style={{ height: '50%' }}>
              
              {/* Utilization Heatmap */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ height: '100%' }}>
                <h3 className="text-xs font-semibold text-slate-400 mb-1">Hourly Utilization</h3>
                <div className="grid grid-cols-8 gap-px text-xs" style={{ height: 'calc(100% - 20px)', overflowY: 'auto' }}>
                  <div></div>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => (
                    <div key={day} className="text-center text-slate-500 text-[10px]">{day}</div>
                  ))}
                  {heatmapData.filter((_, i) => i % 4 === 0).map((row, i) => (
                    <React.Fragment key={i}>
                      <div className="text-right text-slate-500 pr-1 text-[10px]">{row.hour}</div>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(day => {
                        const intensity = row[`${day}_intensity`];
                        return (
                          <div 
                            key={day}
                            className="h-4 rounded-sm cursor-pointer"
                            style={{
                              backgroundColor: intensity > 0 ? `rgba(14, 165, 233, ${intensity})` : 'rgba(51, 65, 85, 0.3)'
                            }}
                            title={`${(row[day] || 0).toFixed(1)} hours`}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Pressure Scatter */}
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ height: '100%' }}>
                <h3 className="text-xs font-semibold text-slate-400 mb-1">Pressure Analysis</h3>
                <div style={{ height: 'calc(100% - 20px)' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 2, right: 2, left: 0, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={colors.borderColor} />
                      <XAxis dataKey="avg" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="max" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Scatter 
                        name="Pressure" 
                        data={data.slice(-50).map(d => ({
                          avg: d.hydraulic_avg_pressure_psi,
                          max: d.hydraulic_max_pressure_psi
                        }))} 
                        fill={colors.secondary}
                        fillOpacity={0.6}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Metrics and Alerts */}
          <div className="col-span-3 flex flex-col gap-2" style={{ height: '100%' }}>
            
            {/* Health Metrics */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2">
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Health Metrics</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Cycle Time Drift</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500" style={{ width: `${data.length > 0 ? Math.min(Math.abs(_.meanBy(data.slice(-20), 'health_cycle_time_drift_pct')) * 10, 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-white">{data.length > 0 ? _.meanBy(data.slice(-20), 'health_cycle_time_drift_pct').toFixed(1) : '0.0'}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Current Drift</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${data.length > 0 ? Math.min(Math.abs(_.meanBy(data.slice(-20), 'health_peak_current_drift_pct')) * 10, 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-white">{data.length > 0 ? _.meanBy(data.slice(-20), 'health_peak_current_drift_pct').toFixed(1) : '0.0'}%</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">Pressure Drift</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${data.length > 0 ? Math.min(Math.abs(_.meanBy(data.slice(-20), 'health_pressure_capability_drift_pct')) * 10, 100) : 0}%` }} />
                    </div>
                    <span className="text-xs text-white">{data.length > 0 ? _.meanBy(data.slice(-20), 'health_pressure_capability_drift_pct').toFixed(1) : '0.0'}%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Anomaly Detection */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold text-slate-400">Anomaly Detection</h3>
                <span className="text-xs text-red-400">{kpis.anomalyCount} detected</span>
              </div>
              <div className="h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.slice(-30).map(d => ({ score: d.health_anomaly_score }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="anomalyGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="score" stroke="#ef4444" fill="url(#anomalyGradient)" strokeWidth={1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Alerts */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2" style={{ flexGrow: 1, minHeight: '120px' }}>
              <h3 className="text-xs font-semibold text-slate-400 mb-1">Recent Alerts</h3>
              <div className="space-y-1 overflow-auto" style={{ maxHeight: 'calc(100% - 20px)' }}>
                {data
                  .filter(d => d.anomaly || d.e_stop || d.overload)
                  .slice(-10)
                  .reverse()
                  .map((alert, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-1 bg-slate-700/30 rounded">
                      <AlertCircle className={`w-3 h-3 ${alert.anomaly ? 'text-red-400' : 'text-amber-400'}`} />
                      <span className="text-xs text-white">{alert.device_id}</span>
                      <span className="text-xs text-slate-400 ml-auto">{new Date(alert.cycle_started_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-2" style={{ marginTop: 'auto' }}>
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-xs text-slate-400">Safety</span>
                </div>
                <span className="text-lg font-bold text-white">{isNaN(100 - parseFloat(kpis.errorRate || 0)) ? '100' : (100 - parseFloat(kpis.errorRate || 0)).toFixed(0)}%</span>
              </div>
              <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-lg p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-3 h-3 text-sky-400" />
                  <span className="text-xs text-slate-400">MTBF</span>
                </div>
                <span className="text-lg font-bold text-white">{!kpis.totalRuntime || isNaN(parseFloat(kpis.totalRuntime)) ? '0' : (parseFloat(kpis.totalRuntime) / Math.max(kpis.errorCount, 1)).toFixed(0)}h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;