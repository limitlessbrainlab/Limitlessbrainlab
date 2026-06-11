// NeuroSense Attribution Component
// This component ensures "Powered by NeuroSense360" is always displayed

import React from 'react';
import { Brain } from 'lucide-react';

const NeuroSenseAttribution = ({
  branding = null,
  position = 'footer-right',
  className = '',
  style = {},
  showIcon = true
}) => {
  const defaultStyles = {
    fontSize: '12px',
    color: '#6B7280',
    fontFamily: 'Inter, sans-serif',
    padding: '8px',
    borderTop: '1px solid #E5E7EB',
    background: '#F9FAFB',
    userSelect: 'none',
    ...style
  };

  const positionStyles = {
    'footer-left': { textAlign: 'left' },
    'footer-center': { textAlign: 'center' },
    'footer-right': { textAlign: 'right' },
    'header-small': {
      fontSize: '10px',
      borderTop: 'none',
      borderBottom: '1px solid #E5E7EB'
    }
  };

  const combinedStyles = {
    ...defaultStyles,
    ...positionStyles[position]
  };

  // Always show attribution - this cannot be disabled
  const attributionText = branding?.poweredByText || 'Powered by NeuroSense360';

  return (
    <div
      className={`neurosense-attribution ${className}`}
      style={combinedStyles}
      data-required="true"
      data-position={position}
    >
      <div className="flex items-center justify-center gap-1">
        {showIcon && (
          <Brain className="w-3 h-3 text-blue-500" />
        )}
        <span>{attributionText}</span>
      </div>

      <style>{`
        .neurosense-attribution {
          position: relative;
          z-index: 1000;
          min-height: 24px;
          display: flex;
          align-items: center;
          justify-content: ${position.includes('left') ? 'flex-start' :
                           position.includes('center') ? 'center' : 'flex-end'};
        }

        .neurosense-attribution::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }

        /* Prevent hiding via CSS */
        .neurosense-attribution,
        .neurosense-attribution * {
          visibility: visible !important;
          display: flex !important;
          opacity: 1 !important;
        }

        /* Print styles */
        @media print {
          .neurosense-attribution {
            display: flex !important;
            visibility: visible !important;
            opacity: 1 !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
          }
        }

        /* High contrast mode */
        @media (prefers-contrast: high) {
          .neurosense-attribution {
            border-color: currentColor;
            background: white;
            color: black;
          }
        }
      `}</style>
    </div>
  );
};

// HOC to wrap components with required attribution
export const withNeuroSenseAttribution = (WrappedComponent, options = {}) => {
  const WithAttribution = (props) => {
    return (
      <div className="relative">
        <WrappedComponent {...props} />
        <NeuroSenseAttribution
          branding={props.branding}
          position={options.position || 'footer-right'}
          showIcon={options.showIcon !== false}
          {...options}
        />
      </div>
    );
  };

  WithAttribution.displayName = `withNeuroSenseAttribution(${WrappedComponent.displayName || WrappedComponent.name})`;
  return WithAttribution;
};

// Hook to get attribution component
export const useNeuroSenseAttribution = (branding = null) => {
  return {
    AttributionComponent: ({ position = 'footer-right', ...props }) => (
      <NeuroSenseAttribution
        branding={branding}
        position={position}
        {...props}
      />
    ),
    attributionText: branding?.poweredByText || 'Powered by NeuroSense360',
    isRequired: true
  };
};

// Validation function to ensure attribution is present
export const validateAttributionPresence = (htmlContent) => {
  const hasNeuroSenseText = htmlContent.includes('Powered by NeuroSense360') ||
                           htmlContent.includes('NeuroSense360') ||
                           htmlContent.includes('neurosense-attribution');

  const hasAttributionClass = htmlContent.includes('neurosense-attribution');

  return {
    isValid: hasNeuroSenseText && hasAttributionClass,
    hasText: hasNeuroSenseText,
    hasClass: hasAttributionClass,
    message: hasNeuroSenseText && hasAttributionClass
      ? 'Attribution is properly present'
      : 'Required NeuroSense360 attribution is missing or incomplete'
  };
};

// Component for report footers
export const ReportFooter = ({ branding, reportData, className = '' }) => {
  return (
    <footer className={`report-footer ${className}`}>
      {/* Report metadata */}
      <div className="report-metadata text-xs text-gray-500 mb-2">
        <div className="flex justify-between items-center">
          <span>Generated: {new Date().toLocaleDateString()}</span>
          {reportData?.id && <span>Report ID: {reportData.id}</span>}
        </div>
      </div>

      {/* Required attribution */}
      <NeuroSenseAttribution
        branding={branding}
        position="footer-center"
        className="report-attribution"
      />

      <style>{`
        .report-footer {
          margin-top: 2rem;
          padding-top: 1rem;
          border-top: 2px solid #E5E7EB;
        }

        .report-metadata {
          padding: 0.5rem 0;
        }

        /* Ensure attribution is always visible */
        .report-attribution {
          margin-top: 0.5rem !important;
        }
      `}</style>
    </footer>
  );
};

export default NeuroSenseAttribution;