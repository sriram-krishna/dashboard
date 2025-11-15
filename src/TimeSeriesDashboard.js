import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { Activity, AlertTriangle, Zap, TrendingUp, TrendingDown, Clock, Gauge, Upload, Battery, Shield, Power, Timer, Database, Wifi, Target, AlertCircle, Download, Settings, Bell } from 'lucide-react';
import Papa from 'papaparse';
import _ from 'lodash';

// ==================== BUSINESS LOGIC LAYER ====================

const DataProcessor = {
  parseCSV: (csvContent, onProgress, onComplete, onError) => {
    let processedCount = 0;
    const batchSize = 10000;
    const allRows = [];
    
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      step: (row) => {
        if (row.data && row.data.Time && row.data.deviceId && row.data.measure_name) {
          allRows.push(row.data);
          processedCount++;
          
          if (processedCount % batchSize === 0) {
            onProgress(Math.min(90, (processedCount / 100000) * 100));
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
      
      processed[deviceId] = {
        timeSeries,
        cycleSummaries,
        realTimeData,
        deviceId
      };
    });
    
    return processed;
  },

  applyFilters: (data, dateRange, timeRange) => {
    let filtered = [...data];
    
    if (dateRange.start && dateRange.end) {
      const startDate = new Date(dateRange.start).getTime();
      const endDate = new Date(dateRange.end).getTime();
      filtered = filtered.filter(d => d.timestamp >= startDate && d.timestamp <= endDate);
    }
    
    if (timeRange !== 'all' && filtered.length > 0) {
      const now = Math.max(...filtered.map(d => d.timestamp));
      let cutoff;
      
      switch(timeRange) {
        case '1h': cutoff = now - (60 * 60 * 1000); break;
        case '3h': cutoff = now - (3 * 60 * 60 * 1000); break;
        case '6h': cutoff = now - (6 * 60 * 60 * 1000); break;
        case '12h': cutoff = now - (12 * 60 * 60 * 1000); break;
        default: cutoff = 0;
      }
      
      filtered = filtered.filter(d => d.timestamp >= cutoff);
    }
    
    return filtered;
  }
};

const MetricsCalculator = {
  calculateFleetKPIs: (cycles, realTime, thresholds) => {
    if (!cycles.length) return {};
    
    const totalCycles = cycles.length;
    const avgCycleDuration = _.meanBy(cycles, 'cycle.durationS') || 0;
    const totalEnergy = _.sumBy(cycles, 'energy.totalWh') || 0;
    const errorCount = cycles.filter(c => c['cycle.overall'] === 1).length;
    
    const eStopCount = realTime.filter(r => r['DI2_ES_Overload_Key'] === 1).length;
    const doorViolations = realTime.filter(r => r['DI4_Door'] === 1 && r['DI1_KM'] === 1).length;
    
    const totalRuntime = _.sumBy(cycles, 'cycle.durationS') / 3600;
    
    const timestamps = cycles.map(c => c.timestamp);
    const timeWindowHours = timestamps.length > 0 ? 
      (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60) : 1;
    const utilizationRate = timeWindowHours > 0 ? (totalRuntime / timeWindowHours) * 100 : 0;
    
    const idleTime = Math.max(0, timeWindowHours - totalRuntime);
    
    const avgInrushPeak = _.meanBy(cycles, 'inrush.maxPeakA') || 0;
    const avgLoadFactor = _.meanBy(cycles, 'workCurrent.loadFactor') || 0;
    const avgVoltageLevel = _.meanBy(cycles, 'workVoltage.levelPct') || 0;
    
    return {
      totalCycles,
      avgCycleDuration: avgCycleDuration.toFixed(2),
      totalEnergy: totalEnergy.toFixed(2),
      errorCount,
      eStopCount,
      doorViolations,
      totalRuntime: totalRuntime.toFixed(2),
      utilizationRate: utilizationRate.toFixed(1),
      idleTime: idleTime.toFixed(2),
      timeWindowHours: timeWindowHours.toFixed(2),
      avgEnergyPerCycle: totalCycles > 0 ? (totalEnergy / totalCycles).toFixed(3) : 0,
      avgInrushPeak: avgInrushPeak.toFixed(2),
      avgLoadFactor: avgLoadFactor.toFixed(2),
      avgVoltageLevel: avgVoltageLevel.toFixed(2)
    };
  },

  calculateCycleMetrics: (cycles) => {
    if (!cycles.length) return { trends: [], distribution: [], driftAnalysis: [], baseline: 0 };
    
    const durations = cycles.map(c => c['cycle.durationS'] || 0);
    const baseline = durations.length > 0 ? durations.slice().sort()[Math.floor(durations.length / 2)] : 0;
    
    const trends = cycles.map((c, idx) => {
      const duration = c['cycle.durationS'] || 0;
      const drift = baseline > 0 ? ((duration - baseline) / baseline) * 100 : 0;
      
      return {
        cycle: idx + 1,
        duration: parseFloat(duration.toFixed(2)),
        energy: parseFloat((c['energy.workWh'] || 0).toFixed(2)),
        powerFactor: parseFloat((c['workCurrent.loadFactor'] || 0).toFixed(2)),
        drift: parseFloat(drift.toFixed(2)),
        baseline: parseFloat(baseline.toFixed(2)),
        time: c.timeStr,
        isDrifting: Math.abs(drift) > 10
      };
    });
    
    const distribution = _.range(0, Math.ceil(_.max(durations) || 30), 2).map(bucket => ({
      range: `${bucket}-${bucket + 2}s`,
      count: durations.filter(d => d >= bucket && d < bucket + 2).length
    }));
    
    return { trends, distribution, driftAnalysis: trends.slice(-30), baseline };
  },

  calculateElectricalMetrics: (cycles, thresholds) => {
    if (!cycles.length) return { inrush: [], voltage: [], current: [], startDelay: [] };
    
    const inrush = cycles.map((c, idx) => ({
      cycle: idx + 1,
      peakA: parseFloat((c['inrush.maxPeakA'] || 0).toFixed(2)),
      meanA: parseFloat((c['inrush.meanPeakA'] || 0).toFixed(2)),
      unbalance: parseFloat((c['inrush.unbalancePct'] || 0).toFixed(2)),
      duration: parseFloat((c['inrush.durationMs'] || 0).toFixed(0)),
      multiple: parseFloat((c['inrush.multiple'] || 0).toFixed(2)),
      time: c.timeStr,
      isHigh: (c['inrush.multiple'] || 0) > thresholds.inrushMultiple
    }));
    
    const voltage = cycles.map((c, idx) => ({
      cycle: idx + 1,
      level: parseFloat((c['workVoltage.levelPct'] || 0).toFixed(2)),
      unbalance: parseFloat((c['workVoltage.unbalancePct'] || 0).toFixed(2)),
      sagDepth: parseFloat((c['voltageSag.sagDepthPct'] || 0).toFixed(2)),
      sagDuration: parseFloat((c['voltageSag.sagDurationMaxMs'] || 0).toFixed(0)),
      sagLevel: parseFloat((c['voltageSag.sagLevelMinV'] || 0).toFixed(1)),
      time: c.timeStr,
      hasSag: (c['voltageSag.sagDepthPct'] || 0) > thresholds.voltageSag
    }));
    
    const current = cycles.map((c, idx) => ({
      cycle: idx + 1,
      loadFactor: parseFloat((c['workCurrent.loadFactor'] || 0).toFixed(2)),
      meanA: parseFloat((c['workCurrent.meanAvgA'] || 0).toFixed(2)),
      unbalance: parseFloat((c['workCurrent.unbalancePct'] || 0).toFixed(2)),
      ripple: parseFloat((c['workCurrent.rippleMaxPct'] || 0).toFixed(2)),
      time: c.timeStr,
      hasIssue: (c['workCurrent.unbalancePct'] || 0) > thresholds.currentUnbalance
    }));
    
    const startDelay = cycles.map((c, idx) => ({
      cycle: idx + 1,
      maxMs: parseFloat((c['startDelay.delayMaxMs'] || 0).toFixed(2)),
      meanMs: parseFloat((c['startDelay.delayMeanMs'] || 0).toFixed(2)),
      time: c.timeStr
    }));
    
    return { inrush, voltage, current, startDelay };
  },

  calculateVoltageMonitoring: (realTimeData) => {
    if (!realTimeData.length) return [];
    
    return realTimeData.slice(-100)
      .filter(d => d['voltage.U1'] !== undefined)
      .map(d => ({
        time: d.timeStr,
        U1: parseFloat((d['voltage.U1'] || 0).toFixed(1)),
        U2: parseFloat((d['voltage.U2'] || 0).toFixed(1)),
        U3: parseFloat((d['voltage.U3'] || 0).toFixed(1)),
        temp: parseFloat((d['temperature.ambient'] || 0).toFixed(1))
      }));
  },

  calculateAnomalies: (cycles, thresholds) => {
    if (!cycles.length) return { anomalies: [], count: 0, recentAnomalies: [], severity: {} };
    
    const anomalies = cycles.map((c, idx) => {
      const inrushHigh = (c['inrush.multiple'] || 0) > thresholds.inrushMultiple;
      const voltageIssue = (c['voltageSag.sagDepthPct'] || 0) > thresholds.voltageSag;
      const currentIssue = (c['workCurrent.unbalancePct'] || 0) > thresholds.currentUnbalance;
      const rippleHigh = (c['workCurrent.rippleMaxPct'] || 0) > thresholds.ripple;
      const cycleError = c['cycle.overall'] === 1;
      
      const anomalyScore = [inrushHigh, voltageIssue, currentIssue, rippleHigh, cycleError].filter(Boolean).length;
      
      return {
        cycle: idx + 1,
        score: anomalyScore,
        isAnomaly: anomalyScore >= 2,
        time: c.timeStr,
        inrushHigh,
        voltageIssue,
        currentIssue,
        rippleHigh,
        cycleError
      };
    });
    
    const anomalyCount = anomalies.filter(a => a.isAnomaly).length;
    const recentAnomalies = anomalies.filter(a => a.isAnomaly).slice(-10);
    
    const severity = {
      critical: anomalies.filter(a => a.score >= 4).length,
      high: anomalies.filter(a => a.score === 3).length,
      medium: anomalies.filter(a => a.score === 2).length
    };
    
    return { anomalies, count: anomalyCount, recentAnomalies, severity };
  },

  calculateSafetyMetrics: (realTimeData) => {
    if (!realTimeData.length) return { events: [], timeline: [] };
    
    const safetyEvents = [];
    realTimeData.forEach((point) => {
      if (point['DI2_ES_Overload_Key'] === 1) {
        safetyEvents.push({ type: 'E-Stop/Overload', time: point.timeStr, severity: 'critical' });
      }
      if (point['DI4_Door'] === 1 && point['DI1_KM'] === 1) {
        safetyEvents.push({ type: 'Door Open Violation', time: point.timeStr, severity: 'high' });
      }
      if (point['DI8_Full_Error'] === 1) {
        safetyEvents.push({ type: 'Full Error', time: point.timeStr, severity: 'critical' });
      }
    });
    
    const timeline = realTimeData.slice(-200).map(d => ({
      time: d.timeStr,
      eStop: d['DI2_ES_Overload_Key'] || 0,
      doorOpen: d['DI4_Door'] || 0,
      fullError: d['DI8_Full_Error'] || 0
    }));
    
    return { events: safetyEvents.slice(-20), timeline };
  },

  calculateEnergyMetrics: (cycles) => {
    if (!cycles.length) return { efficiency: [], hourly: [], composite: [] };
    
    const efficiency = cycles.map((c, idx) => ({
      cycle: idx + 1,
      totalWh: parseFloat((c['energy.totalWh'] || 0).toFixed(2)),
      workWh: parseFloat((c['energy.workWh'] || 0).toFixed(2)),
      efficiencyPct: c['energy.totalWh'] > 0 ? parseFloat(((c['energy.workWh'] / c['energy.totalWh']) * 100).toFixed(1)) : 0,
      powerW: parseFloat((c['energy.powerWorkW'] || 0).toFixed(0)),
      time: c.timeStr
    }));
    
    const byHour = _.groupBy(cycles, c => {
      const date = new Date(c.time);
      return `${date.getHours()}:00`;
    });
    
    const hourly = Object.entries(byHour).map(([hour, hourCycles]) => ({
      hour,
      totalWh: parseFloat((_.sumBy(hourCycles, 'energy.totalWh') || 0).toFixed(2)),
      cycles: hourCycles.length,
      avgPower: parseFloat((_.meanBy(hourCycles, 'energy.powerWorkW') || 0).toFixed(0))
    }));
    
    const composite = cycles.slice(-20).map((c, idx) => {
      const energyScore = c['energy.totalWh'] > 0 ? ((c['energy.workWh'] / c['energy.totalWh']) * 100) : 0;
      const voltageScore = 100 - Math.abs(100 - (c['workVoltage.levelPct'] || 0));
      const loadScore = (c['workCurrent.loadFactor'] || 0) * 100;
      const overallScore = (energyScore + voltageScore + loadScore) / 3;
      
      return {
        cycle: idx + 1,
        energyScore: parseFloat(energyScore.toFixed(1)),
        voltageScore: parseFloat(voltageScore.toFixed(1)),
        loadScore: parseFloat(loadScore.toFixed(1)),
        overallScore: parseFloat(overallScore.toFixed(1))
      };
    });
    
    return { efficiency, hourly, composite };
  },

  calculateVoltageSagAnalysis: (cycles) => {
    if (!cycles.length) return { sags: [], severity: {} };
    
    const sags = cycles
      .filter(c => (c['voltageSag.sagDepthPct'] || 0) > 0)
      .map((c, idx) => ({
        cycle: idx + 1,
        depth: parseFloat((c['voltageSag.sagDepthPct'] || 0).toFixed(2)),
        duration: parseFloat((c['voltageSag.sagDurationMaxMs'] || 0).toFixed(0)),
        minLevel: parseFloat((c['voltageSag.sagLevelMinV'] || 0).toFixed(1)),
        time: c.timeStr,
        severity: (c['voltageSag.sagDepthPct'] || 0) > 60 ? 'critical' : 
                  (c['voltageSag.sagDepthPct'] || 0) > 40 ? 'high' : 'medium'
      }));
    
    const severity = {
      critical: sags.filter(s => s.severity === 'critical').length,
      high: sags.filter(s => s.severity === 'high').length,
      medium: sags.filter(s => s.severity === 'medium').length
    };
    
    return { sags: sags.slice(-30), severity };
  },

  calculateUtilizationHeatmap: (realTimeData) => {
    if (!realTimeData.length) return { days: [], hours: [], data: [] };
    
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const heatmap = {};
    
    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        heatmap[`${dayIndex}-${hour}`] = 0;
      });
    });
    
    realTimeData.forEach(record => {
      if (record['DI1_KM'] === 1) {
        const date = new Date(record.time);
        const dayIndex = date.getDay();
        const hour = date.getHours();
        const key = `${dayIndex}-${hour}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
      }
    });
    
    const maxValue = Math.max(...Object.values(heatmap), 1);
    const heatmapArray = [];
    
    days.forEach((day, dayIndex) => {
      hours.forEach(hour => {
        const value = heatmap[`${dayIndex}-${hour}`] || 0;
        heatmapArray.push({
          day: dayIndex,
          hour,
          dayName: day,
          value,
          intensity: (value / maxValue) * 100
        });
      });
    });
    
    return { days, hours, data: heatmapArray };
  },

  calculateIdleActiveAnalysis: (realTimeData) => {
    if (!realTimeData.length) return { activeHours: 0, idleHours: 0, activePercent: 0, totalHours: 0 };
    
    const activeCount = realTimeData.filter(r => r['DI1_KM'] === 1).length;
    const totalCount = realTimeData.length;
    
    const activePercent = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
    
    const readingIntervalHours = 25 / 3600;
    const activeHours = activeCount * readingIntervalHours;
    const totalHours = totalCount * readingIntervalHours;
    const idleHours = totalHours - activeHours;
    
    return {
      activeHours: activeHours.toFixed(2),
      idleHours: idleHours.toFixed(2),
      totalHours: totalHours.toFixed(2),
      activePercent: activePercent.toFixed(1)
    };
  },

  calculateLifetimeMetrics: (allCycles, thresholds) => {
    if (!allCycles.length) return { lifetimeCycles: 0, rul: 0, rulDays: 0, mtbf: 0, mttr: 2.5, remainingCycles: 0 };
    
    const lifetimeCycles = allCycles.length;
    
    const threshold = thresholds.lifetimeCycleThreshold;
    const remainingCycles = Math.max(0, threshold - lifetimeCycles);
    const rulPercent = (remainingCycles / threshold) * 100;
    
    const timestamps = allCycles.map(c => c.timestamp);
    const dataSpanDays = timestamps.length > 0 ? 
      (Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60 * 60 * 24) : 1;
    const avgCyclesPerDay = dataSpanDays > 0 ? lifetimeCycles / dataSpanDays : lifetimeCycles;
    const rulDays = avgCyclesPerDay > 0 ? remainingCycles / avgCyclesPerDay : 0;
    
    const failures = allCycles.filter(c => c['cycle.overall'] === 1).length;
    const totalRuntime = _.sumBy(allCycles, 'cycle.durationS') / 3600;
    const mtbf = failures > 0 ? totalRuntime / failures : totalRuntime;
    
    return {
      lifetimeCycles,
      rul: rulPercent.toFixed(1),
      rulDays: rulDays.toFixed(0),
      remainingCycles,
      mtbf: mtbf.toFixed(1),
      mttr: 2.5
    };
  },

  calculateDIStateTimeline: (realTimeData) => {
    if (!realTimeData.length) return [];
    
    return realTimeData.slice(-50).map(d => ({
      time: d.timeStr,
      KM: d['DI1_KM'] || 0,
      Overload: d['DI2_ES_Overload_Key'] || 0,
      Gate: d['DI3_Gate'] || 0,
      Door: d['DI4_Door'] || 0,
      GateDown: d['DI5_GateDown'] || 0,
      Pressure: d['DI6_PressureSwitchDigital'] || 0,
      YDown: d['DI7_Y_Down'] || 0,
      Error: d['DI8_Full_Error'] || 0
    }));
  },

  generateReport: (deviceId, fleetKPIs, anomalyMetrics, safetyMetrics, voltageSagAnalysis, lifetimeMetrics) => {
    const report = {
      timestamp: new Date().toISOString(),
      device: deviceId,
      summary: fleetKPIs,
      anomalies: {
        total: anomalyMetrics.count,
        severity: anomalyMetrics.severity,
        recent: anomalyMetrics.recentAnomalies
      },
      safetyEvents: safetyMetrics.events,
      lifetime: lifetimeMetrics,
      recommendations: []
    };
    
    if (anomalyMetrics.count > 5) {
      report.recommendations.push('High anomaly count detected - recommend maintenance inspection');
    }
    if (fleetKPIs.eStopCount > 3) {
      report.recommendations.push('Multiple E-Stop events - investigate safety concerns');
    }
    if (parseFloat(fleetKPIs.avgLoadFactor) < 0.5) {
      report.recommendations.push('Low load factor - check for underloading or inefficient operation');
    }
    if (voltageSagAnalysis.severity.critical > 0) {
      report.recommendations.push('Critical voltage sags detected - check power supply quality');
    }
    if (parseFloat(lifetimeMetrics.rul) < 20) {
      report.recommendations.push('Machine approaching end-of-life - plan replacement within ' + lifetimeMetrics.rulDays + ' days');
    }
    if (parseFloat(lifetimeMetrics.mtbf) < 100) {
      report.recommendations.push('Low MTBF indicates poor reliability - investigate recurring failure modes');
    }
    
    return report;
  }
};

// ==================== UI COMPONENTS ====================

const MetricCard = ({ title, value, unit, trend, subtitle, icon: Icon, gradient, alert, theme }) => (
  <div className="rounded-xl backdrop-blur-lg p-4 transition-all duration-300 hover:scale-[1.02]" style={{ 
    background: theme.card,
    border: `1px solid ${alert ? theme.colors.danger : theme.border}`,
    boxShadow: theme.shadows.md
  }}>
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1">
        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: theme.text.muted }}>
          {title}
        </div>
        {subtitle && (
          <div className="text-xs opacity-75" style={{ color: theme.text.muted }}>
            {subtitle}
          </div>
        )}
      </div>
      {Icon && (
        <div className="p-2 rounded-lg" style={{ background: gradient || `${theme.colors.primary}20` }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      )}
    </div>
    <div className="flex items-baseline gap-2 mb-2">
      <span className="text-2xl font-bold" style={{ color: theme.text.primary }}>{value}</span>
      {unit && <span className="text-sm font-medium" style={{ color: theme.text.secondary }}>{unit}</span>}
    </div>
    {alert && (
      <div className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color: theme.colors.danger }}>
        <Bell className="w-3 h-3" />
        Alert
      </div>
    )}
  </div>
);

const CustomTooltip = ({ active, payload, label, theme }) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 rounded-lg backdrop-blur-lg max-w-xs" style={{ 
        background: theme.card,
        border: `1px solid ${theme.border}`,
        boxShadow: theme.shadows.lg
      }}>
        <p className="text-xs font-semibold mb-2" style={{ color: theme.text.primary }}>{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-xs mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></div>
            <span style={{ color: theme.text.secondary }}>{entry.name}:</span>
            <span className="font-semibold ml-auto" style={{ color: theme.text.primary }}>
              {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const LoadingScreen = ({ progress, theme }) => (
  <div className="h-screen flex items-center justify-center" style={{ background: theme.bg }}>
    <div className="text-center p-8 rounded-2xl backdrop-blur-lg" style={{ 
      background: theme.glass,
      border: `1px solid ${theme.border}`,
      boxShadow: theme.shadows.lg
    }}>
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-full mx-auto" style={{
          background: `conic-gradient(${theme.colors.primary} ${progress}%, ${theme.glass} ${progress}%)`
        }}>
          <div className="absolute inset-2 rounded-full flex items-center justify-center" style={{ background: theme.card }}>
            <span className="text-lg font-bold" style={{ color: theme.colors.primary }}>{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
      <div className="text-xl font-semibold mb-2" style={{ color: theme.text.primary }}>
        Processing Time-Series Data
      </div>
      <div className="text-sm" style={{ color: theme.text.muted }}>
        Streaming and analyzing telemetry records...
      </div>
    </div>
  </div>
);

const UploadScreen = ({ onFileSelect, errorMessage, theme }) => {
  const fileInputRef = useRef(null);
  
  return (
    <div className="h-screen flex items-center justify-center p-4" style={{ background: theme.bg }}>
      <div className="text-center p-12 rounded-2xl backdrop-blur-lg max-w-md" style={{ 
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
          Import your time-series CSV file for comprehensive analytics
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
          onChange={onFileSelect}
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
};

const UtilizationHeatmap = ({ heatmapData, idleActiveAnalysis, theme }) => (
  <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
    <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Utilization Heatmap (Hour × Day)</h3>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-xs" style={{ color: theme.text.muted }}>
        <span>Low</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 0.3 }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 0.6 }}></div>
          <div className="w-3 h-3 rounded-sm" style={{ background: theme.colors.primary, opacity: 1.0 }}></div>
        </div>
        <span>High</span>
      </div>
      <div className="text-xs" style={{ color: theme.text.muted }}>
        Active: {idleActiveAnalysis.activeHours}h ({idleActiveAnalysis.activePercent}%)
      </div>
    </div>
    <div style={{ height: '280px' }}>
      <div className="grid gap-1 h-full" style={{ 
        gridTemplateColumns: 'auto repeat(24, 1fr)',
        gridTemplateRows: 'auto repeat(7, 1fr)',
        fontSize: '10px'
      }}>
        <div></div>
        {heatmapData.hours.map(h => (
          <div key={h} className="text-center font-medium flex items-center justify-center" style={{ color: theme.text.muted }}>
            {h % 4 === 0 ? h : ''}
          </div>
        ))}
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
                  title={`${day} ${hour}:00 - ${cell?.value || 0} readings`}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  </div>
);

const AnomalyCard = ({ anomaly, theme }) => (
  <div className="p-3 rounded-lg" style={{ background: `${theme.colors.danger}15`, border: `1px solid ${theme.colors.danger}40` }}>
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-semibold" style={{ color: theme.colors.danger }}>Cycle #{anomaly.cycle}</span>
      <span className="text-xs px-2 py-1 rounded-full" style={{ background: theme.colors.danger, color: 'white' }}>Score: {anomaly.score}</span>
    </div>
    <div className="text-xs space-y-1" style={{ color: theme.text.muted }}>
      {anomaly.inrushHigh && <div>• High inrush current</div>}
      {anomaly.voltageIssue && <div>• Voltage sag detected</div>}
      {anomaly.currentIssue && <div>• Current unbalance</div>}
      {anomaly.rippleHigh && <div>• Excessive ripple</div>}
      {anomaly.cycleError && <div>• Cycle error flagged</div>}
    </div>
  </div>
);

// ==================== MAIN DASHBOARD COMPONENT ====================

const TimeSeriesDashboard = () => {
  const [rawData, setRawData] = useState([]);
  const [processedData, setProcessedData] = useState({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState('all');
  const [errorMessage, setErrorMessage] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [timeRange, setTimeRange] = useState('all');
  const [alertThresholds, setAlertThresholds] = useState({
    cycleDuration: 25,
    inrushMultiple: 8,
    voltageSag: 60,
    currentUnbalance: 15,
    ripple: 70,
    lifetimeCycleThreshold: 50000,
    mtbfThresholdHours: 100
  });
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef(null);

  const theme = {
    bg: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
    card: 'rgba(26, 31, 58, 0.95)',
    glass: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(148, 163, 184, 0.2)',
    text: {
      primary: '#f8fafc',
      secondary: '#e2e8f0',
      muted: '#94a3b8'
    },
    colors: {
      primary: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
      info: '#06b6d4',
      purple: '#8b5cf6',
      teal: '#14b8a6',
      orange: '#f97316'
    },
    gradients: {
      primary: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      danger: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      teal: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
      purple: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
    },
    shadows: {
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.4)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setProgress(0);
    setErrorMessage('');
    
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
          setErrorMessage('Failed to parse CSV');
          setLoading(false);
        }
      );
    } catch (error) {
      console.error('Error reading file:', error);
      setErrorMessage('Failed to read file.');
      setLoading(false);
    }
  };

  const devices = useMemo(() => Object.keys(processedData), [processedData]);
  
  const currentDevice = useMemo(() => {
    if (selectedDevice === 'all' || !processedData[selectedDevice]) {
      return Object.values(processedData)[0];
    }
    return processedData[selectedDevice];
  }, [processedData, selectedDevice]);

  const filteredCycles = useMemo(() => {
    if (!currentDevice?.cycleSummaries) return [];
    return DataProcessor.applyFilters(currentDevice.cycleSummaries, dateRange, timeRange);
  }, [currentDevice, dateRange, timeRange]);

  const filteredRealTime = useMemo(() => {
    if (!currentDevice?.realTimeData) return [];
    return DataProcessor.applyFilters(currentDevice.realTimeData, dateRange, timeRange);
  }, [currentDevice, dateRange, timeRange]);

  const fleetKPIs = useMemo(() => 
    MetricsCalculator.calculateFleetKPIs(filteredCycles, filteredRealTime, alertThresholds),
    [filteredCycles, filteredRealTime, alertThresholds]
  );

  const cycleMetrics = useMemo(() => 
    MetricsCalculator.calculateCycleMetrics(filteredCycles),
    [filteredCycles]
  );

  const electricalMetrics = useMemo(() => 
    MetricsCalculator.calculateElectricalMetrics(filteredCycles, alertThresholds),
    [filteredCycles, alertThresholds]
  );

  const voltageMonitoring = useMemo(() => 
    MetricsCalculator.calculateVoltageMonitoring(filteredRealTime),
    [filteredRealTime]
  );

  const anomalyMetrics = useMemo(() => 
    MetricsCalculator.calculateAnomalies(filteredCycles, alertThresholds),
    [filteredCycles, alertThresholds]
  );

  const safetyMetrics = useMemo(() => 
    MetricsCalculator.calculateSafetyMetrics(filteredRealTime),
    [filteredRealTime]
  );

  const energyMetrics = useMemo(() => 
    MetricsCalculator.calculateEnergyMetrics(filteredCycles),
    [filteredCycles]
  );

  const voltageSagAnalysis = useMemo(() => 
    MetricsCalculator.calculateVoltageSagAnalysis(filteredCycles),
    [filteredCycles]
  );

  const utilizationHeatmap = useMemo(() => 
    MetricsCalculator.calculateUtilizationHeatmap(filteredRealTime),
    [filteredRealTime]
  );

  const idleActiveAnalysis = useMemo(() => 
    MetricsCalculator.calculateIdleActiveAnalysis(filteredRealTime),
    [filteredRealTime]
  );

  const lifetimeMetrics = useMemo(() => 
    MetricsCalculator.calculateLifetimeMetrics(currentDevice?.cycleSummaries || [], alertThresholds),
    [currentDevice, alertThresholds]
  );

  const diStateTimeline = useMemo(() => 
    MetricsCalculator.calculateDIStateTimeline(filteredRealTime),
    [filteredRealTime]
  );

  const handleGenerateReport = () => {
    const report = MetricsCalculator.generateReport(
      selectedDevice,
      fleetKPIs,
      anomalyMetrics,
      safetyMetrics,
      voltageSagAnalysis,
      lifetimeMetrics
    );
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setDateRange({ start: '', end: '' });
    setTimeRange('all');
  };

  if (loading) {
    return <LoadingScreen progress={progress} theme={theme} />;
  }

  if (!currentDevice) {
    return <UploadScreen onFileSelect={handleFileUpload} errorMessage={errorMessage} theme={theme} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: theme.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 backdrop-blur-lg flex-shrink-0" style={{ 
        background: theme.glass,
        borderBottom: `1px solid ${theme.border}`,
        boxShadow: theme.shadows.md
      }}>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl" style={{ background: theme.gradients.primary }}>
              <Activity className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: theme.text.primary }}>
                Time-Series Telemetry Monitor
              </h1>
              <p className="text-sm" style={{ color: theme.text.muted }}>
                Real-time machine health & performance analytics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-lg" style={{
              background: `${theme.colors.primary}20`,
              border: `1px solid ${theme.colors.primary}40`
            }}>
              <Database className="w-4 h-4" style={{ color: theme.colors.primary }} />
              <span className="text-sm font-semibold" style={{ color: theme.colors.primary }}>
                {rawData.length.toLocaleString()} records
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-lg" style={{
              background: `${theme.colors.success}20`,
              border: `1px solid ${theme.colors.success}40`
            }}>
              <Wifi className="w-4 h-4" style={{ color: theme.colors.success }} />
              <span className="text-sm font-semibold" style={{ color: theme.colors.success }}>
                {devices.length} device(s)
              </span>
            </div>
            {anomalyMetrics.count > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-full backdrop-blur-lg animate-pulse" style={{
                background: `${theme.colors.danger}20`,
                border: `1px solid ${theme.colors.danger}40`
              }}>
                <Bell className="w-4 h-4" style={{ color: theme.colors.danger }} />
                <span className="text-sm font-semibold" style={{ color: theme.colors.danger }}>
                  {anomalyMetrics.count} anomalies
                </span>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-white transition-all duration-300 hover:scale-105" 
            style={{ background: theme.gradients.primary, boxShadow: theme.shadows.md }}
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
          
          <button 
            onClick={handleGenerateReport}
            className="px-4 py-2 rounded-xl flex items-center gap-2 font-semibold text-white transition-all duration-300 hover:scale-105" 
            style={{ background: theme.gradients.success, boxShadow: theme.shadows.md }}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-xl transition-all duration-300 hover:scale-105" 
            style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text.secondary }}
          >
            <Settings className="w-5 h-5" />
          </button>
          
          <select 
            value={selectedDevice} 
            onChange={(e) => setSelectedDevice(e.target.value)} 
            className="px-4 py-2 rounded-xl font-medium" 
            style={{ background: theme.card, color: theme.text.primary, border: `1px solid ${theme.border}` }}
          >
            {devices.map(device => (
              <option key={device} value={device}>{device}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-6 py-4 backdrop-blur-lg" style={{ background: theme.glass, borderBottom: `1px solid ${theme.border}` }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: theme.text.primary }}>Alert Thresholds & Settings</h3>
          <div className="grid grid-cols-7 gap-4">
            {Object.entries(alertThresholds).map(([key, value]) => (
              <div key={key}>
                <label className="text-xs capitalize" style={{ color: theme.text.muted }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input 
                  type="number" 
                  value={value}
                  onChange={(e) => setAlertThresholds({...alertThresholds, [key]: parseFloat(e.target.value)})}
                  className="w-full px-2 py-1 rounded-lg text-sm mt-1"
                  style={{ background: theme.card, color: theme.text.primary, border: `1px solid ${theme.border}` }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="px-6 py-3 backdrop-blur-lg flex items-center gap-4" style={{ background: theme.glass, borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" style={{ color: theme.text.muted }} />
          <span className="text-sm font-semibold" style={{ color: theme.text.muted }}>Filters:</span>
        </div>
        
        <select 
          value={timeRange} 
          onChange={(e) => setTimeRange(e.target.value)} 
          className="px-3 py-2 rounded-lg text-sm font-medium" 
          style={{ background: theme.card, color: theme.text.primary, border: `1px solid ${theme.border}` }}
        >
          <option value="all">All Time</option>
          <option value="1h">Last 1 Hour</option>
          <option value="3h">Last 3 Hours</option>
          <option value="6h">Last 6 Hours</option>
          <option value="12h">Last 12 Hours</option>
        </select>
        
        <div className="flex items-center gap-2">
          <label className="text-sm" style={{ color: theme.text.muted }}>From:</label>
          <input 
            type="datetime-local" 
            value={dateRange.start}
            onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: theme.card, color: theme.text.primary, border: `1px solid ${theme.border}` }}
          />
        </div>
        
        <div className="flex items-center gap-2">
          <label className="text-sm" style={{ color: theme.text.muted }}>To:</label>
          <input 
            type="datetime-local" 
            value={dateRange.end}
            onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: theme.card, color: theme.text.primary, border: `1px solid ${theme.border}` }}
          />
        </div>
        
        <button 
          onClick={clearFilters}
          className="px-3 py-2 rounded-lg text-sm font-medium transition-all duration-300 hover:scale-105"
          style={{ background: theme.card, color: theme.text.secondary, border: `1px solid ${theme.border}` }}
        >
          Clear Filters
        </button>
        
        <div className="ml-auto text-sm" style={{ color: theme.text.muted }}>
          Showing: {filteredCycles.length} cycles ({fleetKPIs.timeWindowHours || 0} hours)
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          
          {/* Fleet Overview */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Target className="w-6 h-6" style={{ color: theme.colors.primary }} />
              Fleet Overview
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
              <MetricCard title="Total Cycles" subtitle="Completed" value={fleetKPIs.totalCycles} icon={Activity} gradient={theme.gradients.primary} theme={theme} />
              <MetricCard title="Avg Cycle Time" subtitle="Mean duration" value={fleetKPIs.avgCycleDuration} unit="s" icon={Clock} gradient={theme.gradients.success} alert={parseFloat(fleetKPIs.avgCycleDuration || 0) > alertThresholds.cycleDuration} theme={theme} />
              <MetricCard title="Total Runtime" subtitle="Active hours" value={fleetKPIs.totalRuntime} unit="hrs" icon={Timer} gradient={theme.gradients.teal} theme={theme} />
              <MetricCard title="Utilization Rate" subtitle="Runtime / Window" value={fleetKPIs.utilizationRate} unit="%" icon={Gauge} gradient={theme.gradients.purple} theme={theme} />
              <MetricCard title="Idle Time" subtitle="Inactive hours" value={fleetKPIs.idleTime} unit="hrs" icon={Clock} gradient={theme.gradients.warning} theme={theme} />
              <MetricCard title="Energy Consumed" subtitle="Total usage" value={fleetKPIs.totalEnergy} unit="Wh" icon={Zap} gradient={theme.gradients.warning} theme={theme} />
              <MetricCard title="Cycle Errors" subtitle="Failed ops" value={fleetKPIs.errorCount} icon={AlertTriangle} gradient={theme.gradients.danger} alert={fleetKPIs.errorCount > 0} theme={theme} />
              <MetricCard title="E-Stop Events" subtitle="Emergency stops" value={fleetKPIs.eStopCount} icon={Shield} gradient={theme.gradients.danger} alert={fleetKPIs.eStopCount > 2} theme={theme} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <MetricCard title="Door Violations" subtitle="Safety breaches" value={fleetKPIs.doorViolations} icon={AlertCircle} gradient={theme.gradients.warning} alert={fleetKPIs.doorViolations > 0} theme={theme} />
              <MetricCard title="Energy/Cycle" subtitle="Efficiency" value={fleetKPIs.avgEnergyPerCycle} unit="Wh" icon={Battery} gradient={theme.gradients.success} theme={theme} />
              <MetricCard title="Lifetime Cycles" subtitle="Total operations" value={lifetimeMetrics.lifetimeCycles} icon={Activity} gradient={theme.gradients.primary} theme={theme} />
              <MetricCard title="Remaining Life" subtitle="Until EOL" value={lifetimeMetrics.rul} unit="%" icon={Battery} gradient={theme.gradients.success} alert={parseFloat(lifetimeMetrics.rul) < 20} theme={theme} />
            </div>
          </div>

          {/* Extended Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard title="Avg Inrush Peak" subtitle="Motor startup" value={fleetKPIs.avgInrushPeak} unit="A" icon={Zap} gradient={theme.gradients.warning} theme={theme} />
            <MetricCard title="Avg Load Factor" subtitle="Current efficiency" value={fleetKPIs.avgLoadFactor} icon={Gauge} gradient={theme.gradients.success} alert={parseFloat(fleetKPIs.avgLoadFactor || 0) < 0.5} theme={theme} />
            <MetricCard title="MTBF" subtitle="Time between failures" value={lifetimeMetrics.mtbf} unit="hrs" icon={Timer} gradient={theme.gradients.teal} alert={parseFloat(lifetimeMetrics.mtbf) < alertThresholds.mtbfThresholdHours} theme={theme} />
            <MetricCard title="Est. RUL" subtitle="Days until EOL" value={lifetimeMetrics.rulDays} unit="days" icon={AlertCircle} gradient={theme.gradients.purple} alert={parseFloat(lifetimeMetrics.rulDays) < 90} theme={theme} />
          </div>

          {/* Cycle Time Drift */}
          <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <TrendingUp className="w-6 h-6" style={{ color: theme.colors.warning }} />
              Cycle Time Drift Detection
              <span className="text-sm font-normal ml-auto" style={{ color: theme.text.muted }}>
                Baseline: {cycleMetrics.baseline?.toFixed(2)}s
              </span>
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={cycleMetrics.driftAnalysis} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="duration" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="drift" orientation="right" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line yAxisId="duration" type="monotone" dataKey="baseline" stroke={theme.colors.success} strokeWidth={2} strokeDasharray="5 5" dot={false} name="Baseline" />
                <Line yAxisId="duration" type="monotone" dataKey="duration" stroke={theme.colors.primary} strokeWidth={2} dot={{ r: 4 }} name="Actual (s)" />
                <Bar yAxisId="drift" dataKey="drift" fill={theme.colors.warning} radius={[4, 4, 0, 0]} name="Drift %" opacity={0.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Cycle Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Duration & Energy Trends</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={cycleMetrics.trends.slice(-30)} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line yAxisId="left" type="monotone" dataKey="duration" stroke={theme.colors.primary} strokeWidth={2} name="Duration (s)" />
                  <Line yAxisId="right" type="monotone" dataKey="energy" stroke={theme.colors.warning} strokeWidth={2} name="Energy (Wh)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Duration Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={cycleMetrics.distribution} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="range" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Bar dataKey="count" fill={theme.colors.primary} radius={[4, 4, 0, 0]} name="Cycles" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Electrical Health Monitoring */}
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Zap className="w-6 h-6" style={{ color: theme.colors.warning }} />
              Electrical Health Monitoring
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
                <h3 className="text-base font-bold mb-4" style={{ color: theme.text.primary }}>Inrush Current</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={electricalMetrics.inrush.slice(-30)} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <YAxis stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip theme={theme} />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="peakA" stroke={theme.colors.danger} strokeWidth={2} name="Peak (A)" />
                    <Line type="monotone" dataKey="multiple" stroke={theme.colors.orange} strokeWidth={2} name="Multiple" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
                <h3 className="text-base font-bold mb-4" style={{ color: theme.text.primary }}>Voltage Sag</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={voltageSagAnalysis.sags} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <YAxis stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip theme={theme} />} />
                    <Bar dataKey="depth" fill={theme.colors.danger} radius={[4, 4, 0, 0]} name="Sag %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
                <h3 className="text-base font-bold mb-4" style={{ color: theme.text.primary }}>Current Quality</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={electricalMetrics.current.slice(-30)} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                    <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <YAxis stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip theme={theme} />} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Line type="monotone" dataKey="loadFactor" stroke={theme.colors.info} strokeWidth={2} name="Load Factor" />
                    <Line type="monotone" dataKey="ripple" stroke={theme.colors.purple} strokeWidth={2} name="Ripple %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Start Delay Tracking */}
          <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Timer className="w-6 h-6" style={{ color: theme.colors.teal }} />
              Start Delay Tracking
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={electricalMetrics.startDelay.slice(-30)} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="maxMs" fill={theme.colors.warning} radius={[4, 4, 0, 0]} name="Max Delay (ms)" opacity={0.6} />
                <Line type="monotone" dataKey="meanMs" stroke={theme.colors.teal} strokeWidth={3} dot={{ r: 4 }} name="Mean Delay (ms)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Real-Time Voltage & Temperature */}
          <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Power className="w-6 h-6" style={{ color: theme.colors.info }} />
              Real-Time Voltage & Temperature
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={voltageMonitoring} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="time" stroke={theme.text.muted} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis yAxisId="voltage" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="temp" orientation="right" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line yAxisId="voltage" type="monotone" dataKey="U1" stroke={theme.colors.primary} strokeWidth={2} dot={false} name="U1 (V)" />
                <Line yAxisId="voltage" type="monotone" dataKey="U2" stroke={theme.colors.success} strokeWidth={2} dot={false} name="U2 (V)" />
                <Line yAxisId="voltage" type="monotone" dataKey="U3" stroke={theme.colors.info} strokeWidth={2} dot={false} name="U3 (V)" />
                <Line yAxisId="temp" type="monotone" dataKey="temp" stroke={theme.colors.warning} strokeWidth={2} dot={false} name="Temp (°C)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Utilization Heatmap & Idle/Active */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <UtilizationHeatmap heatmapData={utilizationHeatmap} idleActiveAnalysis={idleActiveAnalysis} theme={theme} />

            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Idle vs Active Time</h3>
              <div className="mb-6">
                <div className="flex justify-between text-sm mb-2" style={{ color: theme.text.secondary }}>
                  <span>Active Time</span>
                  <span className="font-bold" style={{ color: theme.colors.success }}>{idleActiveAnalysis.activeHours}h ({idleActiveAnalysis.activePercent}%)</span>
                </div>
                <div className="w-full h-8 rounded-full overflow-hidden flex" style={{ background: theme.glass }}>
                  <div className="h-full transition-all duration-500" style={{ 
                    width: `${idleActiveAnalysis.activePercent}%`,
                    background: theme.gradients.success
                  }}></div>
                  <div className="h-full flex-1" style={{ background: theme.gradients.danger, opacity: 0.5 }}></div>
                </div>
                <div className="flex justify-between text-sm mt-2" style={{ color: theme.text.secondary }}>
                  <span>Idle Time</span>
                  <span className="font-bold" style={{ color: theme.colors.danger }}>{idleActiveAnalysis.idleHours}h ({(100 - parseFloat(idleActiveAnalysis.activePercent)).toFixed(1)}%)</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.success}15`, border: `1px solid ${theme.colors.success}40` }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: theme.colors.success }}>{idleActiveAnalysis.activeHours}</div>
                  <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>ACTIVE HOURS</div>
                </div>
                <div className="p-4 rounded-xl text-center" style={{ background: `${theme.colors.danger}15`, border: `1px solid ${theme.colors.danger}40` }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: theme.colors.danger }}>{idleActiveAnalysis.idleHours}</div>
                  <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>IDLE HOURS</div>
                </div>
                <div className="p-4 rounded-xl text-center col-span-2" style={{ background: `${theme.colors.info}15`, border: `1px solid ${theme.colors.info}40` }}>
                  <div className="text-3xl font-bold mb-1" style={{ color: theme.colors.info }}>{idleActiveAnalysis.totalHours}</div>
                  <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>TOTAL WINDOW</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lifetime & EOL Planning */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Lifetime & EOL Planning</h3>
              <div className="space-y-4">
                <div className="p-4 rounded-xl" style={{ background: theme.glass }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold" style={{ color: theme.text.secondary }}>Lifetime Cycles</span>
                    <span className="text-2xl font-bold" style={{ color: theme.colors.primary }}>{lifetimeMetrics.lifetimeCycles}</span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: theme.glass }}>
                    <div className="h-full transition-all duration-500" style={{ 
                      width: `${100 - parseFloat(lifetimeMetrics.rul)}%`,
                      background: parseFloat(lifetimeMetrics.rul) < 20 ? theme.gradients.danger : theme.gradients.success
                    }}></div>
                  </div>
                  <div className="text-xs mt-2" style={{ color: theme.text.muted }}>
                    {lifetimeMetrics.remainingCycles} cycles until EOL threshold ({alertThresholds.lifetimeCycleThreshold})
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl text-center" style={{ background: `${theme.colors.teal}15` }}>
                    <div className="text-xl font-bold" style={{ color: theme.colors.teal }}>{lifetimeMetrics.mtbf}</div>
                    <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>MTBF (hrs)</div>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ background: `${theme.colors.warning}15` }}>
                    <div className="text-xl font-bold" style={{ color: theme.colors.warning }}>{lifetimeMetrics.mttr}</div>
                    <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>MTTR (hrs)</div>
                  </div>
                  <div className="p-3 rounded-xl text-center" style={{ background: `${theme.colors.purple}15` }}>
                    <div className="text-xl font-bold" style={{ color: theme.colors.purple }}>{lifetimeMetrics.rulDays}</div>
                    <div className="text-xs font-semibold" style={{ color: theme.text.muted }}>RUL (days)</div>
                  </div>
                </div>
                
                {parseFloat(lifetimeMetrics.rul) < 20 && (
                  <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: `${theme.colors.danger}15`, border: `1px solid ${theme.colors.danger}40` }}>
                    <AlertTriangle className="w-5 h-5" style={{ color: theme.colors.danger }} />
                    <div className="text-sm font-semibold" style={{ color: theme.colors.danger }}>
                      WARNING: Machine approaching end-of-life threshold
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Cumulative Cycle Count</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={cycleMetrics.trends.map((t, idx) => ({ 
                  cycle: t.cycle, 
                  cumulative: idx + 1,
                  time: t.time
                }))} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <defs>
                    <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={theme.colors.primary} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={theme.colors.primary} stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Area type="monotone" dataKey="cumulative" stroke={theme.colors.primary} fill="url(#cumulativeGradient)" name="Cumulative Cycles" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Energy Efficiency & Safety */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Energy Efficiency Score</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={energyMetrics.composite} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area type="monotone" dataKey="overallScore" fill={theme.colors.success} stroke={theme.colors.success} fillOpacity={0.3} name="Overall Score" />
                  <Line type="monotone" dataKey="energyScore" stroke={theme.colors.warning} strokeWidth={2} name="Energy" />
                  <Line type="monotone" dataKey="loadScore" stroke={theme.colors.info} strokeWidth={2} name="Load" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Safety Events</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={safetyMetrics.timeline.slice(-100)} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="time" stroke={theme.text.muted} tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                  <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Area type="stepAfter" dataKey="eStop" fill={theme.colors.danger} stroke={theme.colors.danger} fillOpacity={0.6} name="E-Stop" />
                  <Area type="stepAfter" dataKey="doorOpen" fill={theme.colors.warning} stroke={theme.colors.warning} fillOpacity={0.6} name="Door Open" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Anomaly Detection */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Anomaly Detection Score</h3>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={anomalyMetrics.anomalies.slice(-50)} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                  <XAxis dataKey="cycle" stroke={theme.text.muted} tick={{ fontSize: 10 }} />
                  <YAxis stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip theme={theme} />} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="score" fill={theme.colors.danger} radius={[4, 4, 0, 0]} name="Anomaly Score" />
                  <Line type="monotone" dataKey="score" stroke={theme.colors.warning} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
              <h3 className="text-lg font-bold mb-4" style={{ color: theme.text.primary }}>Recent Anomalies</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {anomalyMetrics.recentAnomalies.length > 0 ? (
                  anomalyMetrics.recentAnomalies.map((anomaly, idx) => (
                    <AnomalyCard key={idx} anomaly={anomaly} theme={theme} />
                  ))
                ) : (
                  <div className="text-center py-8 text-sm" style={{ color: theme.colors.success }}>✓ No anomalies detected</div>
                )}
              </div>
            </div>
          </div>

          {/* Digital Input Timeline */}
          <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Shield className="w-6 h-6" style={{ color: theme.colors.danger }} />
              Digital Input State Timeline
            </h2>
            <div className="grid grid-cols-8 gap-2 text-xs font-semibold mb-3" style={{ color: theme.text.muted }}>
              <div>Time</div>
              <div>KM</div>
              <div>Overload</div>
              <div>Gate</div>
              <div>Door</div>
              <div>GateDown</div>
              <div>Pressure</div>
              <div>Y-Down</div>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {diStateTimeline.map((state, idx) => (
                <div key={idx} className="grid grid-cols-8 gap-2 p-2 rounded-lg text-xs" style={{ background: theme.glass }}>
                  <div style={{ color: theme.text.primary }}>{state.time}</div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.KM ? theme.colors.success : theme.colors.danger + '40', color: 'white' }}>
                      {state.KM}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.Overload ? theme.colors.danger : theme.colors.success + '40', color: 'white' }}>
                      {state.Overload}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.Gate ? theme.colors.success : theme.colors.warning + '40', color: 'white' }}>
                      {state.Gate}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.Door ? theme.colors.warning : theme.colors.success + '40', color: 'white' }}>
                      {state.Door}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.GateDown ? theme.colors.info : theme.colors.success + '40', color: 'white' }}>
                      {state.GateDown}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.Pressure ? theme.colors.success : theme.colors.danger + '40', color: 'white' }}>
                      {state.Pressure}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="px-2 py-1 rounded" style={{ background: state.YDown ? theme.colors.info : theme.colors.success + '40', color: 'white' }}>
                      {state.YDown}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Hourly Energy Consumption */}
          <div className="rounded-xl p-6 backdrop-blur-lg" style={{ background: theme.card, border: `1px solid ${theme.border}`, boxShadow: theme.shadows.md }}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-3" style={{ color: theme.text.primary }}>
              <Battery className="w-6 h-6" style={{ color: theme.colors.warning }} />
              Hourly Energy Consumption
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={energyMetrics.hourly} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                <XAxis dataKey="hour" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="energy" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="cycles" orientation="right" stroke={theme.text.muted} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip theme={theme} />} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar yAxisId="energy" dataKey="totalWh" fill={theme.colors.warning} radius={[4, 4, 0, 0]} name="Energy (Wh)" />
                <Line yAxisId="cycles" type="monotone" dataKey="cycles" stroke={theme.colors.primary} strokeWidth={3} dot={{ r: 5 }} name="Cycles" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TimeSeriesDashboard;