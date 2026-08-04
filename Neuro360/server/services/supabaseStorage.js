/**
 * Supabase Storage Service
 * Handles file uploads to Supabase storage buckets
 */

const { createRoutedClient } = require('../dbRouter');
const fs = require('fs');
const path = require('path');

// Routed per-request (prod vs staging by origin); plain prod client when staging
// env vars are not configured. null only if prod Supabase creds are missing.
const supabase = createRoutedClient();

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('⚠️  Supabase credentials not found in environment variables');
}

class SupabaseStorage {
  /**
   * Upload a file to Supabase storage bucket
   * @param {string} filePath - Local file path to upload
   * @param {string} bucketName - Name of the Supabase bucket (default: 'neurosense-reports')
   * @param {string} destinationPath - Path within the bucket (optional)
   * @returns {Promise<{success: boolean, url: string, path: string}>}
   */
  static async uploadFile(filePath, bucketName = 'neurosense-reports', destinationPath = null, contentType = 'application/pdf') {
    try {
      console.log('📤 Uploading file to Supabase storage...');
      console.log('   Local file:', filePath);
      console.log('   Bucket:', bucketName);

      // Check if Supabase client is initialized
      if (!supabase) {
        throw new Error('Supabase client not initialized - check environment variables');
      }

      // Read the file
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);

      // Determine the storage path
      const storagePath = destinationPath || `reports/${fileName}`;

      console.log('   Storage path:', storagePath);

      // Upload to Supabase
      const { data, error } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, fileBuffer, {
          contentType: contentType || 'application/octet-stream',
          upsert: true // Overwrite if file exists
        });

      if (error) {
        console.error('❌ Supabase upload error:', error);
        throw new Error(`Failed to upload to Supabase: ${error.message}`);
      }

      console.log('✅ File uploaded successfully to Supabase');
      console.log('   Upload data:', data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;
      console.log('🔗 Public URL:', publicUrl);

      return {
        success: true,
        url: publicUrl,
        path: storagePath,
        bucket: bucketName
      };

    } catch (error) {
      console.error('❌ Error uploading file to Supabase:', error);
      throw error;
    }
  }

  /**
   * Delete a file from Supabase storage
   * @param {string} storagePath - Path within the bucket
   * @param {string} bucketName - Name of the bucket
   * @returns {Promise<{success: boolean}>}
   */
  static async deleteFile(storagePath, bucketName = 'neurosense-reports') {
    try {
      console.log('🗑️  Deleting file from Supabase storage...');
      console.log('   Path:', storagePath);

      const { error } = await supabase.storage
        .from(bucketName)
        .remove([storagePath]);

      if (error) {
        console.error('❌ Supabase delete error:', error);
        throw new Error(`Failed to delete from Supabase: ${error.message}`);
      }

      console.log('✅ File deleted successfully from Supabase');

      return {
        success: true
      };

    } catch (error) {
      console.error('❌ Error deleting file from Supabase:', error);
      throw error;
    }
  }

  /**
   * Create a short-lived signed URL for a private file.
   * @param {string} bucketName - Name of the bucket
   * @param {string} filePath - Path within the bucket
   * @param {number} expiresIn - Seconds the URL stays valid (default 300)
   * @returns {Promise<{success: boolean, signedUrl: string}>}
   */
  static async getSignedUrl(bucketName, filePath, expiresIn = 300) {
    if (!supabase) {
      throw new Error('Supabase client not initialized - check environment variables');
    }

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error('❌ Supabase signed-url error:', error);
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }

    return { success: true, signedUrl: data?.signedUrl || null };
  }

  /**
   * List files in a Supabase storage bucket
   * @param {string} bucketName - Name of the bucket
   * @param {string} prefix - Optional path prefix
   * @returns {Promise<Array>}
   */
  static async listFiles(bucketName = 'neurosense-reports', prefix = '') {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .list(prefix);

      if (error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }

      return data || [];

    } catch (error) {
      console.error('❌ Error listing files from Supabase:', error);
      throw error;
    }
  }

  /**
   * Get public URL for a file in Supabase storage
   * @param {string} bucketName - Name of the bucket
   * @param {string} filePath - Path to the file in the bucket
   * @returns {string} - Public URL
   */
  static getPublicUrl(bucketName, filePath) {
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return data?.publicUrl || null;
  }

  /**
   * List QEEG input files for a specific patient
   * Supports both new readable folder names (HOPE-202512-0001_Name) and legacy UUID folders
   * @param {string} patientId - Patient UUID
   * @returns {Promise<Object>} - { eyesOpen: [], eyesClosed: [] }
   */
  static async listPatientQEEGFiles(patientId) {
    try {
      console.log(`📂 Listing QEEG files for patient: ${patientId}`);

      // First try to find the readable folder by looking up patient's external_id
      let folderName = patientId;
      if (supabase) {
        const { data: patient } = await supabase
          .from('patients')
          .select('external_id, full_name')
          .eq('id', patientId)
          .single();

        if (patient && patient.external_id) {
          const sanitizedName = (patient.full_name || 'Unknown').replace(/[^a-zA-Z0-9\s\-]/g, '').replace(/\s+/g, '_').trim();
          const readableFolder = `${patient.external_id}_${sanitizedName}`;
          // Check if readable folder exists
          const { data: readableFiles } = await supabase.storage
            .from('qeeg-uploads')
            .list(readableFolder);
          if (readableFiles && readableFiles.length > 0) {
            folderName = readableFolder;
            console.log(`   Using readable folder: ${folderName}`);
          } else {
            console.log(`   Readable folder not found, falling back to UUID: ${patientId}`);
          }
        }
      }

      const files = await this.listFiles('qeeg-uploads', folderName);

      const eyesOpenFiles = [];
      const eyesClosedFiles = [];

      for (const file of files) {
        const filePath = `${folderName}/${file.name}`;
        const url = this.getPublicUrl('qeeg-uploads', filePath);

        const fileInfo = {
          name: file.name,
          path: filePath,
          url: url,
          size: file.metadata?.size || 0,
          createdAt: file.created_at || file.updated_at
        };

        if (file.name.includes('EyesOpen')) {
          eyesOpenFiles.push(fileInfo);
        } else if (file.name.includes('EyesClosed')) {
          eyesClosedFiles.push(fileInfo);
        }
      }

      // Sort by created date (newest first)
      eyesOpenFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      eyesClosedFiles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      console.log(`   Found ${eyesOpenFiles.length} Eyes Open files, ${eyesClosedFiles.length} Eyes Closed files`);

      return {
        eyesOpen: eyesOpenFiles,
        eyesClosed: eyesClosedFiles
      };

    } catch (error) {
      console.error('❌ Error listing patient QEEG files:', error);
      return { eyesOpen: [], eyesClosed: [] };
    }
  }
}

module.exports = SupabaseStorage;
