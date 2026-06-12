// File Management Service for DataAccess
// Handles file operations, downloads, and document generation

import supabase from '../lib/supabaseClient';
import brandingService from './brandingService';

class FileManagementService {
  constructor() {
  }

  /**
   * Get all files for a patient
   */
  async getPatientFiles(patientId) {
    try {
      if (!supabase) {
        return this.getMockPatientFiles(patientId);
      }

      // In production, query documents table
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching patient files:', error);
      return this.getMockPatientFiles(patientId);
    }
  }

  /**
   * Get all files for a clinic
   */
  async getClinicFiles(clinicId) {
    try {
      if (!supabase) {
        return this.getMockClinicFiles(clinicId);
      }

      // Query files through patients belonging to clinic
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          patients!inner (
            id,
            full_name,
            clinic_id
          )
        `)
        .eq('patients.clinic_id', clinicId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching clinic files:', error);
      return this.getMockClinicFiles(clinicId);
    }
  }

  /**
   * Generate and download a report
   */
  async downloadReport(reportId, patientId, type = 'pdf') {
    try {

      const reportData = await this.generateReportData(reportId, patientId);
      const branding = await brandingService.getClinicBranding(reportData.clinicId);

      let content;
      switch (type.toLowerCase()) {
        case 'pdf':
          content = await this.generatePDFReport(reportData, branding);
          break;
        case 'html':
          content = await this.generateHTMLReport(reportData, branding);
          break;
        case 'json':
          content = JSON.stringify(reportData, null, 2);
          break;
        default:
          throw new Error(`Unsupported file type: ${type}`);
      }

      // Create download
      const blob = new Blob([content], {
        type: this.getMimeType(type)
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportData.patient.name}-${reportData.type}-${reportData.date}.${type}`;
      link.click();

      URL.revokeObjectURL(url);

      return { success: true, filename: link.download };
    } catch (error) {
      console.error('Error downloading report:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate QEEG report data
   */
  async generateQEEGReport(patientId, sessionId = null) {
    try {
      const reportData = {
        id: `qeeg-${Date.now()}`,
        type: 'QEEG Analysis',
        patient: await this.getPatientData(patientId),
        session: sessionId ? await this.getSessionData(sessionId) : null,
        metrics: await this.generateQEEGMetrics(patientId),
        analysis: await this.generateQEEGAnalysis(patientId),
        recommendations: await this.generateRecommendations(patientId),
        generatedAt: new Date().toISOString(),
        clinicId: (await this.getPatientData(patientId)).clinicId
      };

      return reportData;
    } catch (error) {
      console.error('Error generating QEEG report:', error);
      return this.getMockQEEGReport(patientId);
    }
  }

  /**
   * Generate personalized care plan
   */
  async generateCarePlan(patientId) {
    try {
      const patient = await this.getPatientData(patientId);
      const sessions = await this.getPatientSessions(patientId);
      const assessments = await this.getPatientAssessments(patientId);

      const carePlan = {
        id: `careplan-${Date.now()}`,
        type: 'Personalized Care Plan',
        patient: patient,
        currentPhase: this.determineCarePlanPhase(sessions, assessments),
        goals: await this.generatePatientGoals(patientId),
        interventions: await this.generateInterventions(patientId),
        schedule: await this.generateSchedule(patientId),
        progressMetrics: await this.defineProgressMetrics(patientId),
        nextReview: this.calculateNextReviewDate(),
        generatedAt: new Date().toISOString(),
        clinicId: patient.clinicId
      };

      return carePlan;
    } catch (error) {
      console.error('Error generating care plan:', error);
      return this.getMockCarePlan(patientId);
    }
  }

  /**
   * Generate branded HTML report
   */
  async generateHTMLReport(reportData, branding) {
    const logoHTML = branding?.primaryLogo ?
      `<img src="${branding.primaryLogo}" alt="Clinic Logo" style="height: 60px; margin-bottom: 20px;">` : '';

    const template = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${reportData.type} - ${reportData.patient.name}</title>
          <style>
            ${brandingService.getBrandingCSS(branding)}
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              color: #1f2937;
            }
            .header {
              text-align: center;
              border-bottom: 3px solid #3b82f6;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .section {
              margin-bottom: 30px;
              padding: 20px;
              background: #f8fafc;
              border-radius: 8px;
              border-left: 4px solid #3b82f6;
            }
            .metric {
              display: inline-block;
              background: white;
              padding: 15px;
              margin: 10px;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              min-width: 120px;
              text-align: center;
            }
            .metric-value {
              font-size: 24px;
              font-weight: bold;
              color: #3b82f6;
            }
            .metric-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .recommendation {
              background: #ecfdf5;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 10px 0;
            }
            @media print {
              body { padding: 20px; }
              .section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            ${logoHTML}
            <h1>${reportData.type}</h1>
            <p><strong>Patient:</strong> ${reportData.patient.name}</p>
            <p><strong>Generated:</strong> ${new Date(reportData.generatedAt).toLocaleDateString()}</p>
          </div>

          ${this.generateReportContent(reportData)}

          <!-- Required Attribution -->
          <div class="neurosense-attribution">
            <span>${branding?.poweredByText || 'Powered by NeuroSense360'}</span>
          </div>
        </body>
      </html>
    `;

    return template;
  }

  /**
   * Generate report content based on type
   */
  generateReportContent(reportData) {
    switch (reportData.type) {
      case 'QEEG Analysis':
        return this.generateQEEGContent(reportData);
      case 'Personalized Care Plan':
        return this.generateCarePlanContent(reportData);
      default:
        return `<div class="section"><h2>Report Data</h2><pre>${JSON.stringify(reportData, null, 2)}</pre></div>`;
    }
  }

  generateQEEGContent(reportData) {
    return `
      <div class="section">
        <h2> Brain Activity Metrics</h2>
        ${reportData.metrics?.map(metric => `
          <div class="metric">
            <div class="metric-value">${metric.value}</div>
            <div class="metric-label">${metric.label}</div>
          </div>
        `).join('') || '<p>No metrics available</p>'}
      </div>

      <div class="section">
        <h2>DATA: Analysis Results</h2>
        <p>${reportData.analysis || 'Analysis data not available'}</p>
      </div>

      <div class="section">
        <h2>IDEA: Recommendations</h2>
        ${reportData.recommendations?.map(rec => `
          <div class="recommendation">
            <strong>${rec.category}:</strong> ${rec.text}
          </div>
        `).join('') || '<p>No recommendations available</p>'}
      </div>
    `;
  }

  generateCarePlanContent(reportData) {
    return `
      <div class="section">
        <h2>TARGET: Treatment Goals</h2>
        <ul>
          ${reportData.goals?.map(goal => `<li>${goal}</li>`).join('') || '<li>No goals defined</li>'}
        </ul>
      </div>

      <div class="section">
        <h2>REFRESH: Interventions</h2>
        ${reportData.interventions?.map(intervention => `
          <div style="margin-bottom: 15px;">
            <strong>${intervention.type}:</strong> ${intervention.description}
          </div>
        `).join('') || '<p>No interventions defined</p>'}
      </div>

      <div class="section">
        <h2> Treatment Schedule</h2>
        <p>${reportData.schedule || 'Schedule to be determined'}</p>
      </div>
    `;
  }

  /**
   * Helper functions
   */

  getMimeType(type) {
    const mimeTypes = {
      'pdf': 'application/pdf',
      'html': 'text/html',
      'json': 'application/json',
      'txt': 'text/plain'
    };
    return mimeTypes[type.toLowerCase()] || 'application/octet-stream';
  }

  async generateReportData(reportId, patientId) {
    // This would fetch real report data
    return {
      id: reportId,
      type: 'QEEG Analysis',
      patient: { name: 'John Doe', id: patientId },
      date: new Date().toISOString().split('T')[0],
      clinicId: 'clinic-1'
    };
  }

  async getPatientData(patientId) {
    // Mock patient data
    return {
      id: patientId,
      name: 'John Doe',
      age: 34,
      gender: 'Male',
      clinicId: 'clinic-1'
    };
  }

  // Mock data generators
  getMockPatientFiles(patientId) {
    return [
      {
        id: `file-${patientId}-1`,
        name: 'QEEG Analysis Report.pdf',
        type: 'report',
        size: 2456789,
        created_at: '2024-09-15T10:30:00Z',
        patient_id: patientId
      },
      {
        id: `file-${patientId}-2`,
        name: 'Personalized Care Plan.pdf',
        type: 'careplan',
        size: 1234567,
        created_at: '2024-09-10T14:20:00Z',
        patient_id: patientId
      }
    ];
  }

  getMockClinicFiles(clinicId) {
    return [
      {
        id: `clinic-file-1`,
        name: 'Monthly Report Summary.pdf',
        type: 'summary',
        size: 5678901,
        created_at: '2024-09-01T09:00:00Z',
        clinic_id: clinicId
      }
    ];
  }

  getMockQEEGReport(patientId) {
    return {
      id: `qeeg-mock-${patientId}`,
      type: 'QEEG Analysis',
      patient: { name: 'Mock Patient', id: patientId },
      metrics: [
        { label: 'Alpha Waves', value: '8.2 Hz' },
        { label: 'Beta Activity', value: '75%' },
        { label: 'Focus Score', value: '8.4/10' }
      ],
      analysis: 'Brain activity shows healthy patterns with good focus capabilities.',
      recommendations: [
        { category: 'Lifestyle', text: 'Maintain regular sleep schedule' },
        { category: 'Training', text: 'Continue neurofeedback sessions 2x weekly' }
      ],
      generatedAt: new Date().toISOString(),
      clinicId: 'clinic-1'
    };
  }

  getMockCarePlan(patientId) {
    return {
      id: `careplan-mock-${patientId}`,
      type: 'Personalized Care Plan',
      patient: { name: 'Mock Patient', id: patientId },
      goals: [
        'Improve attention span by 30%',
        'Reduce anxiety symptoms',
        'Enhance sleep quality'
      ],
      interventions: [
        { type: 'Neurofeedback', description: 'Bi-weekly sessions focusing on alpha/theta training' },
        { type: 'Mindfulness', description: 'Daily 10-minute meditation practice' }
      ],
      schedule: 'Weekly sessions for 8 weeks, then bi-weekly maintenance',
      generatedAt: new Date().toISOString(),
      clinicId: 'clinic-1'
    };
  }
}

// Create and export singleton instance
const fileManagementService = new FileManagementService();
export default fileManagementService;