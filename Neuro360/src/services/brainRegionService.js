import { supabase } from '../lib/supabaseClient';

class BrainRegionService {
  /**
   * Fetch all brain regions/lobes
   * @returns {Promise<Object>} - Brain regions data as object keyed by region_id
   */
  async getBrainRegions() {
    try {
      const { data, error } = await supabase
        .from('brain_regions')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching brain regions:', error);
        throw error;
      }

      const toArray = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; } }
        return [];
      };

      // Transform array to object keyed by region_id for easy access
      const regionsObject = {};
      (data || []).forEach(region => {
        regionsObject[region.region_id] = {
          name: region.name,
          color: region.color,
          position: region.position || {},
          responsibilities: toArray(region.responsibilities),
          strengthen: toArray(region.strengthen),
          description: region.description,
          icon: region.icon
        };
      });

      return regionsObject;
    } catch (error) {
      console.error('BrainRegionService.getBrainRegions error:', error);
      return null;
    }
  }

  /**
   * Get a single brain region by ID
   * @param {string} regionId - Region ID (e.g., 'frontal', 'parietal')
   * @returns {Promise<Object>} - Region data
   */
  async getRegionById(regionId) {
    try {
      const { data, error } = await supabase
        .from('brain_regions')
        .select('*')
        .eq('region_id', regionId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching brain region:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('BrainRegionService.getRegionById error:', error);
      return null;
    }
  }

  /**
   * Fetch brain health quotes
   * @returns {Promise<Array>} - Array of quotes
   */
  async getBrainQuotes() {
    try {
      const { data, error } = await supabase
        .from('brain_quotes')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching brain quotes:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('BrainRegionService.getBrainQuotes error:', error);
      return [];
    }
  }

  /**
   * Get a random brain quote
   * @returns {Promise<Object>} - Random quote
   */
  async getRandomQuote() {
    try {
      const quotes = await this.getBrainQuotes();
      if (quotes.length === 0) {
        return {
          quote: "NeuroSense translates your signals into clear, actionable insights. Brain Age is your compass, track it, nudge it, and watch it improve.",
          author: "NeuroSense Philosophy"
        };
      }
      return quotes[Math.floor(Math.random() * quotes.length)];
    } catch (error) {
      console.error('BrainRegionService.getRandomQuote error:', error);
      return {
        quote: "NeuroSense translates your signals into clear, actionable insights.",
        author: "NeuroSense Philosophy"
      };
    }
  }

  /**
   * Get brain health tips
   * @param {string} category - Optional category filter
   * @returns {Promise<Array>} - Array of tips
   */
  async getBrainTips(category = null) {
    try {
      let query = supabase
        .from('brain_tips')
        .select('*')
        .eq('is_active', true);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching brain tips:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('BrainRegionService.getBrainTips error:', error);
      return [];
    }
  }

  /**
   * Add a new brain region (admin only)
   * @param {Object} regionData - Region data
   * @returns {Promise<Object>} - Result
   */
  async addBrainRegion(regionData) {
    try {
      const { data, error } = await supabase
        .from('brain_regions')
        .insert([{
          region_id: regionData.regionId,
          name: regionData.name,
          color: regionData.color,
          position: regionData.position,
          responsibilities: regionData.responsibilities || [],
          strengthen: regionData.strengthen || [],
          description: regionData.description,
          icon: regionData.icon,
          display_order: regionData.displayOrder || 0,
          is_active: true,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding brain region:', error);
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error('BrainRegionService.addBrainRegion error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update brain region data
   * @param {string} regionId - Region ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Result
   */
  async updateBrainRegion(regionId, updates) {
    try {
      const { data, error } = await supabase
        .from('brain_regions')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('region_id', regionId)
        .select()
        .single();

      if (error) {
        console.error('Error updating brain region:', error);
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error('BrainRegionService.updateBrainRegion error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch all brain parameters for sidebar menu
   * @returns {Promise<Array>} - Array of brain parameters
   */
  async getBrainParameters() {
    try {
      const { data, error } = await supabase
        .from('brain_parameters')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching brain parameters:', error);
        throw error;
      }

      // Transform to the format expected by sidebar
      return (data || []).map(param => ({
        id: param.param_id,
        label: param.label,
        icon: param.icon,
        description: param.description,
        intro: param.intro
      }));
    } catch (error) {
      console.error('BrainRegionService.getBrainParameters error:', error);
      return null;
    }
  }

  /**
   * Get a single brain parameter by ID
   * @param {string} paramId - Parameter ID (e.g., 'cognition', 'stress')
   * @returns {Promise<Object>} - Parameter data
   */
  async getParameterById(paramId) {
    try {
      const { data, error } = await supabase
        .from('brain_parameters')
        .select('*')
        .eq('param_id', paramId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching brain parameter:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('BrainRegionService.getParameterById error:', error);
      return null;
    }
  }
}

export default new BrainRegionService();
