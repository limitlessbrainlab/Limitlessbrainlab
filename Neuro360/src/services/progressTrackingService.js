// Progress Tracking Service
// Handles longitudinal data analysis, progress comparisons, and trend tracking

import supabase from '../lib/supabaseClient';
import aiAnalysisService from './aiAnalysisService';

class ProgressTrackingService {
  constructor() {

    // Progress metrics configuration
    this.progressMetrics = {
      attention: {
        name: 'Attention & Focus',
        unit: 'score',
        range: [0, 100],
        target: 85,
        interpretation: {
          excellent: [90, 100],
          good: [75, 89],
          average: [60, 74],
          needsWork: [0, 59]
        }
      },
      relaxation: {
        name: 'Relaxation Response',
        unit: 'score',
        range: [0, 100],
        target: 80,
        interpretation: {
          excellent: [85, 100],
          good: [70, 84],
          average: [55, 69],
          needsWork: [0, 54]
        }
      },
      cognitiveFlexibility: {
        name: 'Cognitive Flexibility',
        unit: 'score',
        range: [0, 100],
        target: 75,
        interpretation: {
          excellent: [85, 100],
          good: [70, 84],
          average: [55, 69],
          needsWork: [0, 54]
        }
      },
      sleepQuality: {
        name: 'Sleep Quality',
        unit: 'score',
        range: [0, 100],
        target: 80,
        interpretation: {
          excellent: [85, 100],
          good: [70, 84],
          average: [55, 69],
          needsWork: [0, 54]
        }
      },
      stressResilience: {
        name: 'Stress Resilience',
        unit: 'score',
        range: [0, 100],
        target: 75,
        interpretation: {
          excellent: [80, 100],
          good: [65, 79],
          average: [50, 64],
          needsWork: [0, 49]
        }
      }
    };
  }

  /**
   * Get complete progress history for a patient
   */
  async getPatientProgressHistory(patientId, timeframe = '6months') {
    try {
      if (!supabase) {
        return this.getMockProgressHistory(patientId);
      }

      // Calculate date range based on timeframe
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case '1month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case '3months':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case '6months':
          startDate.setMonth(endDate.getMonth() - 6);
          break;
        case '1year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setMonth(endDate.getMonth() - 6);
      }

      // Get all analyses for the patient in timeframe
      const { data: analyses, error } = await supabase
        .from('cloud_analyses')
        .select('*')
        .eq('patient_id', patientId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Process analyses into progress metrics
      const progressData = await this.processAnalysesIntoProgress(analyses);

      return {
        timeframe,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        dataPoints: progressData.length,
        progressData,
        trends: this.calculateTrends(progressData),
        improvements: this.identifyImprovements(progressData),
        recommendations: await this.generateProgressRecommendations(progressData)
      };

    } catch (error) {
      console.error('ERROR: Failed to get progress history:', error);
      return this.getMockProgressHistory(patientId);
    }
  }

  /**
   * Compare progress between two time periods
   */
  async compareProgressPeriods(patientId, period1Start, period1End, period2Start, period2End) {
    try {

      // Get data for both periods
      const period1Data = await this.getProgressForPeriod(patientId, period1Start, period1End);
      const period2Data = await this.getProgressForPeriod(patientId, period2Start, period2End);

      // Calculate averages for each metric
      const period1Averages = this.calculatePeriodAverages(period1Data);
      const period2Averages = this.calculatePeriodAverages(period2Data);

      // Calculate changes
      const comparison = {};
      for (const metric in this.progressMetrics) {
        const period1Value = period1Averages[metric] || 0;
        const period2Value = period2Averages[metric] || 0;
        const change = period2Value - period1Value;
        const percentChange = period1Value > 0 ? (change / period1Value) * 100 : 0;

        comparison[metric] = {
          name: this.progressMetrics[metric].name,
          period1: period1Value,
          period2: period2Value,
          change: change,
          percentChange: percentChange,
          direction: change > 0 ? 'improved' : change < 0 ? 'declined' : 'stable',
          significance: this.assessSignificance(Math.abs(percentChange))
        };
      }

      return {
        period1: { start: period1Start, end: period1End, data: period1Data },
        period2: { start: period2Start, end: period2End, data: period2Data },
        comparison,
        overallTrend: this.calculateOverallTrend(comparison),
        insights: this.generateComparisonInsights(comparison)
      };

    } catch (error) {
      console.error('ERROR: Failed to compare progress periods:', error);
      return this.getMockProgressComparison();
    }
  }

  /**
   * Get current progress status and goals
   */
  async getCurrentProgressStatus(patientId) {
    try {
      // Get latest analysis
      const { data: latestAnalysis, error } = await supabase
        .from('cloud_analyses')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!latestAnalysis) {
        return {
          hasData: false,
          message: 'No analysis data available yet'
        };
      }

      // Extract current metrics
      const currentMetrics = this.extractProgressMetrics(latestAnalysis.analysis_data);

      // Get patient goals
      const goals = await this.getPatientGoals(patientId);

      // Calculate progress towards goals
      const goalProgress = this.calculateGoalProgress(currentMetrics, goals);

      return {
        hasData: true,
        lastUpdate: latestAnalysis.created_at,
        currentMetrics,
        goals,
        goalProgress,
        overallScore: this.calculateOverallScore(currentMetrics),
        nextMilestones: this.identifyNextMilestones(currentMetrics, goals),
        recommendations: this.generateCurrentRecommendations(currentMetrics, goals)
      };

    } catch (error) {
      console.error('ERROR: Failed to get current progress status:', error);
      return this.getMockCurrentStatus();
    }
  }

  /**
   * Track session-by-session improvements
   */
  async getSessionProgressData(patientId, limit = 10) {
    try {
      if (!supabase) {
        return this.getMockSessionProgress();
      }

      const { data: sessions, error } = await supabase
        .from('neurofeedback_sessions')
        .select('*')
        .eq('patient_id', patientId)
        .order('session_date', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return sessions.map(session => ({
        sessionId: session.id,
        date: session.session_date,
        duration: session.duration_minutes,
        protocolUsed: session.protocol_type,
        metrics: {
          attention: session.attention_score || 0,
          relaxation: session.relaxation_score || 0,
          artifacts: session.artifact_percentage || 0,
          coherence: session.coherence_score || 0
        },
        improvement: session.improvement_score || 0,
        notes: session.session_notes
      }));

    } catch (error) {
      console.error('ERROR: Failed to get session progress:', error);
      return this.getMockSessionProgress();
    }
  }

  /**
   * Generate comprehensive progress report
   */
  async generateProgressReport(patientId, includeComparisons = true) {
    try {

      // Get all progress data
      const [
        progressHistory,
        currentStatus,
        sessionData
      ] = await Promise.all([
        this.getPatientProgressHistory(patientId, '6months'),
        this.getCurrentProgressStatus(patientId),
        this.getSessionProgressData(patientId, 20)
      ]);

      // Generate comparisons if requested
      let periodComparison = null;
      if (includeComparisons && progressHistory.progressData.length > 10) {
        const midpoint = Math.floor(progressHistory.progressData.length / 2);
        const period1End = new Date(progressHistory.progressData[midpoint].date);
        const period2Start = new Date(period1End);
        period2Start.setDate(period2Start.getDate() + 1);

        periodComparison = await this.compareProgressPeriods(
          patientId,
          progressHistory.startDate,
          period1End.toISOString(),
          period2Start.toISOString(),
          progressHistory.endDate
        );
      }

      // Calculate additional insights
      const insights = {
        totalSessions: sessionData.length,
        averageImprovement: this.calculateAverageImprovement(sessionData),
        bestPerformingMetric: this.findBestPerformingMetric(currentStatus.currentMetrics),
        areasForImprovement: this.identifyImprovementAreas(currentStatus.currentMetrics),
        consistencyScore: this.calculateConsistencyScore(progressHistory.progressData),
        projectedGoalAchievement: this.projectGoalAchievement(progressHistory.trends, currentStatus.goals)
      };

      return {
        generatedAt: new Date().toISOString(),
        patientId,
        reportPeriod: progressHistory.timeframe,
        progressHistory,
        currentStatus,
        sessionData,
        periodComparison,
        insights,
        recommendations: this.generateComprehensiveRecommendations(
          currentStatus,
          progressHistory,
          insights
        )
      };

    } catch (error) {
      console.error('ERROR: Failed to generate progress report:', error);
      throw new Error(`Progress report generation failed: ${error.message}`);
    }
  }

  /**
   * Helper methods for processing and calculations
   */

  async processAnalysesIntoProgress(analyses) {
    return analyses.map(analysis => {
      const metrics = this.extractProgressMetrics(analysis.analysis_data);
      return {
        date: analysis.created_at,
        sessionId: analysis.session_id,
        qualityScore: analysis.quality_score,
        metrics,
        overallScore: this.calculateOverallScore(metrics)
      };
    });
  }

  extractProgressMetrics(analysisData) {
    if (!analysisData || !analysisData.cognitiveMetrics) {
      return {};
    }

    const cognitive = analysisData.cognitiveMetrics;
    return {
      attention: cognitive.attention?.score || 0,
      relaxation: cognitive.relaxation?.score || 0,
      cognitiveFlexibility: cognitive.cognitive?.workingMemory || 0,
      sleepQuality: cognitive.sleep?.quality || 0,
      stressResilience: 100 - (cognitive.relaxation?.stressLevel || 50)
    };
  }

  calculateTrends(progressData) {
    const trends = {};

    if (progressData.length < 2) return trends;

    for (const metric in this.progressMetrics) {
      const values = progressData
        .map(p => p.metrics[metric])
        .filter(v => v !== undefined && v !== null);

      if (values.length < 2) continue;

      const firstValue = values[0];
      const lastValue = values[values.length - 1];
      const change = lastValue - firstValue;
      const avgChange = change / (values.length - 1);

      trends[metric] = {
        direction: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable',
        change: change,
        averageChange: avgChange,
        consistency: this.calculateTrendConsistency(values)
      };
    }

    return trends;
  }

  calculateTrendConsistency(values) {
    if (values.length < 3) return 0;

    let consistentChanges = 0;
    for (let i = 2; i < values.length; i++) {
      const prev2 = values[i - 2];
      const prev1 = values[i - 1];
      const current = values[i];

      const direction1 = prev1 > prev2 ? 1 : prev1 < prev2 ? -1 : 0;
      const direction2 = current > prev1 ? 1 : current < prev1 ? -1 : 0;

      if (direction1 === direction2) {
        consistentChanges++;
      }
    }

    return (consistentChanges / (values.length - 2)) * 100;
  }

  calculateOverallScore(metrics) {
    const validMetrics = Object.values(metrics).filter(v => !isNaN(v));
    if (validMetrics.length === 0) return 0;
    return validMetrics.reduce((sum, value) => sum + value, 0) / validMetrics.length;
  }

  assessSignificance(percentChange) {
    if (percentChange >= 20) return 'highly significant';
    if (percentChange >= 10) return 'significant';
    if (percentChange >= 5) return 'moderate';
    return 'minimal';
  }

  // Mock data methods for offline functionality
  getMockProgressHistory(patientId) {
    const dates = Array.from({ length: 12 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (11 - i));
      return date.toISOString();
    });

    return {
      timeframe: '6months',
      startDate: dates[0],
      endDate: dates[dates.length - 1],
      dataPoints: dates.length,
      progressData: dates.map((date, i) => ({
        date,
        sessionId: `session-${i + 1}`,
        qualityScore: 85 + Math.random() * 10,
        metrics: {
          attention: 60 + (i * 2) + Math.random() * 10,
          relaxation: 55 + (i * 1.5) + Math.random() * 8,
          cognitiveFlexibility: 50 + (i * 2.5) + Math.random() * 12,
          sleepQuality: 65 + (i * 1.8) + Math.random() * 9,
          stressResilience: 58 + (i * 2.2) + Math.random() * 11
        },
        overallScore: 58 + (i * 2) + Math.random() * 10
      })),
      trends: {
        attention: { direction: 'improving', change: 18, averageChange: 1.5, consistency: 75 },
        relaxation: { direction: 'improving', change: 12, averageChange: 1.0, consistency: 68 },
        cognitiveFlexibility: { direction: 'improving', change: 22, averageChange: 1.8, consistency: 82 }
      },
      improvements: ['Sustained attention increased by 25%', 'Sleep quality improved significantly'],
      recommendations: ['Continue current neurofeedback protocol', 'Add mindfulness practice']
    };
  }

  getMockCurrentStatus() {
    return {
      hasData: true,
      lastUpdate: new Date().toISOString(),
      currentMetrics: {
        attention: 78,
        relaxation: 72,
        cognitiveFlexibility: 75,
        sleepQuality: 80,
        stressResilience: 74
      },
      goals: {
        attention: 85,
        relaxation: 80,
        sleepQuality: 85
      },
      goalProgress: {
        attention: { current: 78, target: 85, percentage: 92 },
        relaxation: { current: 72, target: 80, percentage: 90 },
        sleepQuality: { current: 80, target: 85, percentage: 94 }
      },
      overallScore: 76,
      nextMilestones: ['Reach 80+ attention score', 'Achieve sleep quality target'],
      recommendations: ['Focus on beta training', 'Maintain consistent sleep schedule']
    };
  }

  getMockSessionProgress() {
    return Array.from({ length: 10 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (i * 3));
      return {
        sessionId: `session-${10 - i}`,
        date: date.toISOString().split('T')[0],
        duration: 30,
        protocolUsed: i % 2 === 0 ? 'Alpha/Theta Training' : 'SMR Enhancement',
        metrics: {
          attention: 65 + i * 1.5 + Math.random() * 8,
          relaxation: 60 + i * 1.2 + Math.random() * 6,
          artifacts: Math.max(0, 15 - i * 1.5 + Math.random() * 5),
          coherence: 70 + i * 1.8 + Math.random() * 10
        },
        improvement: Math.min(100, 50 + i * 4 + Math.random() * 15),
        notes: i % 3 === 0 ? 'Excellent focus throughout session' : 'Good progress noted'
      };
    });
  }

  async getPatientGoals(patientId) {
    // In production, these would be stored in database
    return {
      attention: 85,
      relaxation: 80,
      sleepQuality: 85,
      stressResilience: 75
    };
  }

  // Additional helper methods would be implemented here...
  calculatePeriodAverages(data) { return {}; }
  calculateOverallTrend(comparison) { return 'improving'; }
  generateComparisonInsights(comparison) { return []; }
  getMockProgressComparison() { return {}; }
  calculateGoalProgress(metrics, goals) { return {}; }
  identifyNextMilestones(metrics, goals) { return []; }
  generateCurrentRecommendations(metrics, goals) { return []; }
  getProgressForPeriod(patientId, start, end) { return []; }
  identifyImprovements(data) { return []; }
  generateProgressRecommendations(data) { return []; }
  calculateAverageImprovement(sessions) { return 0; }
  findBestPerformingMetric(metrics) { return 'attention'; }
  identifyImprovementAreas(metrics) { return []; }
  calculateConsistencyScore(data) { return 85; }
  projectGoalAchievement(trends, goals) { return {}; }
  generateComprehensiveRecommendations(current, history, insights) { return []; }
}

// Create and export singleton instance
const progressTrackingService = new ProgressTrackingService();
export default progressTrackingService;