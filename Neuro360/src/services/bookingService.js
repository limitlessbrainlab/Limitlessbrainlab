// Booking and Scheduling Service
// Handles appointment scheduling, calendar management, and notifications

import supabase from '../lib/supabaseClient';

class BookingService {
  constructor() {

    // Appointment types and durations
    this.appointmentTypes = {
      'initial-assessment': {
        name: 'Initial QEEG Assessment',
        duration: 60,
        description: 'Comprehensive baseline brain assessment',
        price: 150
      },
      'follow-up': {
        name: 'Follow-up Session',
        duration: 45,
        description: 'Progress review and neurofeedback session',
        price: 100
      },
      'neurofeedback': {
        name: 'Neurofeedback Training',
        duration: 30,
        description: 'Brain training session',
        price: 80
      },
      'consultation': {
        name: 'Consultation',
        duration: 30,
        description: 'Discussion of results and treatment plan',
        price: 75
      },
      'qeeg-analysis': {
        name: 'QEEG Analysis Review',
        duration: 45,
        description: 'Detailed review of brain analysis results',
        price: 120
      }
    };

    // Available time slots (can be customized per clinic)
    this.timeSlots = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
      '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'
    ];
  }

  /**
   * Get available time slots for a specific date and clinic
   */
  async getAvailableSlots(clinicId, date, appointmentType = 'follow-up') {
    try {
      if (!supabase) {
        return this.getMockAvailableSlots(date);
      }

      // Get existing appointments for the date
      const { data: existingAppointments, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date)
        .eq('status', 'scheduled');

      if (error) throw error;

      // Get clinic working hours
      const clinicHours = await this.getClinicWorkingHours(clinicId);
      const appointmentDuration = this.appointmentTypes[appointmentType]?.duration || 30;

      // Calculate available slots
      const availableSlots = this.calculateAvailableSlots(
        existingAppointments,
        clinicHours,
        appointmentDuration,
        date
      );

      return availableSlots;
    } catch (error) {
      console.error('ERROR: Failed to get available slots:', error);
      return this.getMockAvailableSlots(date);
    }
  }

  /**
   * Book an appointment
   */
  async bookAppointment(appointmentData) {
    try {
      if (!supabase) {
        return this.createMockAppointment(appointmentData);
      }

      const {
        patientId,
        clinicId,
        appointmentType,
        date,
        time,
        notes = '',
        requestedBy
      } = appointmentData;

      // Validate appointment type
      if (!this.appointmentTypes[appointmentType]) {
        throw new Error('Invalid appointment type');
      }

      // Check slot availability
      const isAvailable = await this.checkSlotAvailability(clinicId, date, time, appointmentType);
      if (!isAvailable) {
        throw new Error('Selected time slot is no longer available');
      }

      // Calculate end time
      const duration = this.appointmentTypes[appointmentType].duration;
      const startTime = new Date(`${date} ${time}`);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      // Create appointment record
      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
          patient_id: patientId,
          clinic_id: clinicId,
          appointment_type: appointmentType,
          appointment_date: date,
          start_time: time,
          end_time: endTime.toTimeString().substr(0, 5),
          status: 'scheduled',
          notes: notes,
          requested_by: requestedBy,
          created_at: new Date().toISOString(),
          price: this.appointmentTypes[appointmentType].price
        })
        .select()
        .single();

      if (error) throw error;

      // Send confirmation notifications
      await this.sendAppointmentConfirmation(appointment);

      // Create calendar entry
      await this.createCalendarEntry(appointment);

      return appointment;

    } catch (error) {
      console.error('ERROR: Failed to book appointment:', error);
      throw new Error(`Booking failed: ${error.message}`);
    }
  }

  /**
   * Get patient appointments
   */
  async getPatientAppointments(patientId, limit = 10) {
    try {
      if (!supabase) {
        return this.getMockPatientAppointments(patientId);
      }

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          clinics (
            name,
            address,
            phone
          )
        `)
        .eq('patient_id', patientId)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(limit);

      if (error) throw error;

      return appointments.map(apt => ({
        ...apt,
        type: this.appointmentTypes[apt.appointment_type]?.name || apt.appointment_type,
        duration: this.appointmentTypes[apt.appointment_type]?.duration || 30,
        price: this.appointmentTypes[apt.appointment_type]?.price || 0
      }));

    } catch (error) {
      console.error('ERROR: Failed to get patient appointments:', error);
      return this.getMockPatientAppointments(patientId);
    }
  }

  /**
   * Get clinic appointments for a specific date
   */
  async getClinicAppointments(clinicId, date) {
    try {
      if (!supabase) {
        return this.getMockClinicAppointments(clinicId, date);
      }

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patients (
            full_name,
            email,
            phone
          )
        `)
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date)
        .order('start_time', { ascending: true });

      if (error) throw error;

      return appointments.map(apt => ({
        ...apt,
        type: this.appointmentTypes[apt.appointment_type]?.name || apt.appointment_type,
        duration: this.appointmentTypes[apt.appointment_type]?.duration || 30,
        patientName: apt.patients?.full_name || 'Unknown Patient'
      }));

    } catch (error) {
      console.error('ERROR: Failed to get clinic appointments:', error);
      return this.getMockClinicAppointments(clinicId, date);
    }
  }

  /**
   * Reschedule an appointment
   */
  async rescheduleAppointment(appointmentId, newDate, newTime) {
    try {
      if (!supabase) {
        return { success: true, message: 'Appointment rescheduled (mock)' };
      }

      // Get current appointment
      const { data: currentAppointment, error: fetchError } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (fetchError) throw fetchError;

      // Check new slot availability
      const isAvailable = await this.checkSlotAvailability(
        currentAppointment.clinic_id,
        newDate,
        newTime,
        currentAppointment.appointment_type
      );

      if (!isAvailable) {
        throw new Error('New time slot is not available');
      }

      // Calculate new end time
      const duration = this.appointmentTypes[currentAppointment.appointment_type]?.duration || 30;
      const startTime = new Date(`${newDate} ${newTime}`);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      // Update appointment
      const { data: updatedAppointment, error: updateError } = await supabase
        .from('appointments')
        .update({
          appointment_date: newDate,
          start_time: newTime,
          end_time: endTime.toTimeString().substr(0, 5),
          updated_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Send reschedule notification
      await this.sendRescheduleNotification(updatedAppointment);

      return updatedAppointment;

    } catch (error) {
      console.error('ERROR: Failed to reschedule appointment:', error);
      throw new Error(`Reschedule failed: ${error.message}`);
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId, reason = '') {
    try {
      if (!supabase) {
        return { success: true, message: 'Appointment cancelled (mock)' };
      }

      const { data: cancelledAppointment, error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString()
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (error) throw error;

      // Send cancellation notification
      await this.sendCancellationNotification(cancelledAppointment);

      return cancelledAppointment;

    } catch (error) {
      console.error('ERROR: Failed to cancel appointment:', error);
      throw new Error(`Cancellation failed: ${error.message}`);
    }
  }

  /**
   * Helper functions
   */

  async checkSlotAvailability(clinicId, date, time, appointmentType) {
    if (!supabase) return true;

    try {
      const duration = this.appointmentTypes[appointmentType]?.duration || 30;
      const startTime = new Date(`${date} ${time}`);
      const endTime = new Date(startTime.getTime() + duration * 60000);

      const { data: conflicts, error } = await supabase
        .from('appointments')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date)
        .eq('status', 'scheduled')
        .or(`start_time.lte.${endTime.toTimeString().substr(0, 5)},end_time.gte.${time}`);

      if (error) throw error;

      return conflicts.length === 0;
    } catch (error) {
      console.error('ERROR: Failed to check slot availability:', error);
      return false;
    }
  }

  async getClinicWorkingHours(clinicId) {
    // Default working hours (can be customized per clinic)
    return {
      start: '09:00',
      end: '18:00',
      lunchBreak: { start: '12:00', end: '13:00' },
      weekends: false
    };
  }

  calculateAvailableSlots(existingAppointments, clinicHours, duration, date) {
    const availableSlots = [];
    const dayOfWeek = new Date(date).getDay();

    // Skip weekends if clinic doesn't work weekends
    if (!clinicHours.weekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      return availableSlots;
    }

    for (const slot of this.timeSlots) {
      // Check if slot is within working hours
      if (slot < clinicHours.start || slot >= clinicHours.end) continue;

      // Skip lunch break
      if (slot >= clinicHours.lunchBreak.start && slot < clinicHours.lunchBreak.end) continue;

      // Check if slot conflicts with existing appointments
      const slotTime = new Date(`${date} ${slot}`);
      const slotEndTime = new Date(slotTime.getTime() + duration * 60000);

      const hasConflict = existingAppointments.some(apt => {
        const aptStart = new Date(`${date} ${apt.start_time}`);
        const aptEnd = new Date(`${date} ${apt.end_time}`);
        return (slotTime < aptEnd && slotEndTime > aptStart);
      });

      if (!hasConflict) {
        availableSlots.push({
          time: slot,
          display: this.formatTimeForDisplay(slot),
          available: true
        });
      }
    }

    return availableSlots;
  }

  formatTimeForDisplay(time24) {
    const [hours, minutes] = time24.split(':');
    const hour12 = hours % 12 || 12;
    const ampm = hours < 12 ? 'AM' : 'PM';
    return `${hour12}:${minutes} ${ampm}`;
  }

  async sendAppointmentConfirmation(appointment) {
    // In production, this would send email/SMS notifications
    console.log('EMAIL: Sending appointment confirmation:', {
      patientId: appointment.patient_id,
      date: appointment.appointment_date,
      time: appointment.start_time,
      type: appointment.appointment_type
    });
  }

  async sendRescheduleNotification(appointment) {
  }

  async sendCancellationNotification(appointment) {
  }

  async createCalendarEntry(appointment) {
    // In production, this would integrate with calendar services
  }

  // Mock data methods for offline functionality
  getMockAvailableSlots(date) {
    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return []; // No weekend slots

    return [
      { time: '09:00', display: '9:00 AM', available: true },
      { time: '09:30', display: '9:30 AM', available: true },
      { time: '10:00', display: '10:00 AM', available: false },
      { time: '10:30', display: '10:30 AM', available: true },
      { time: '11:00', display: '11:00 AM', available: true },
      { time: '14:00', display: '2:00 PM', available: true },
      { time: '14:30', display: '2:30 PM', available: true },
      { time: '15:00', display: '3:00 PM', available: true },
      { time: '16:00', display: '4:00 PM', available: true }
    ];
  }

  createMockAppointment(appointmentData) {
    return {
      id: `mock-${Date.now()}`,
      ...appointmentData,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      price: this.appointmentTypes[appointmentData.appointmentType]?.price || 100
    };
  }

  getMockPatientAppointments(patientId) {
    return [
      {
        id: 1,
        appointment_type: 'follow-up',
        type: 'Follow-up QEEG Session',
        appointment_date: '2024-10-15',
        start_time: '10:00',
        end_time: '10:45',
        status: 'scheduled',
        duration: 45,
        price: 100,
        clinics: {
          name: 'NeuroHealth Center',
          address: '123 Brain St',
          phone: '(555) 123-4567'
        }
      },
      {
        id: 2,
        appointment_type: 'neurofeedback',
        type: 'Neurofeedback Training',
        appointment_date: '2024-10-22',
        start_time: '14:00',
        end_time: '14:30',
        status: 'scheduled',
        duration: 30,
        price: 80,
        clinics: {
          name: 'NeuroHealth Center',
          address: '123 Brain St',
          phone: '(555) 123-4567'
        }
      }
    ];
  }

  getMockClinicAppointments(clinicId, date) {
    return [
      {
        id: 1,
        appointment_type: 'initial-assessment',
        type: 'Initial QEEG Assessment',
        appointment_date: date,
        start_time: '10:00',
        end_time: '11:00',
        status: 'scheduled',
        duration: 60,
        patientName: 'John Doe',
        patients: {
          full_name: 'John Doe',
          email: 'john@example.com',
          phone: '(555) 987-6543'
        }
      }
    ];
  }

  /**
   * Get upcoming appointments for dashboard
   */
  async getUpcomingAppointments(patientId, limit = 5) {
    const appointments = await this.getPatientAppointments(patientId, limit);
    const today = new Date().toISOString().split('T')[0];

    return appointments.filter(apt =>
      apt.appointment_date >= today && apt.status === 'scheduled'
    );
  }

  /**
   * Get appointment statistics
   */
  async getAppointmentStats(patientId) {
    try {
      const appointments = await this.getPatientAppointments(patientId, 100);

      const stats = {
        total: appointments.length,
        completed: appointments.filter(apt => apt.status === 'completed').length,
        scheduled: appointments.filter(apt => apt.status === 'scheduled').length,
        cancelled: appointments.filter(apt => apt.status === 'cancelled').length,
        totalSpent: appointments.reduce((sum, apt) => sum + (apt.price || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('ERROR: Failed to get appointment stats:', error);
      return { total: 0, completed: 0, scheduled: 0, cancelled: 0, totalSpent: 0 };
    }
  }
}

// Create and export singleton instance
const bookingService = new BookingService();
export default bookingService;