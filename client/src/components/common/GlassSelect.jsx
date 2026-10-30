import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * AppleGlassSelect — Premium Liquid Glass Dropdown
 * 
 * Replaces native OS <select> with an authentic Apple-grade frosted glass experience:
 * - Fluid spring/jelly physics (smooth expansion & collapse)
 * - Translucent backdrop blur with specular glass reflections
 * - Full typeahead keyboard search (instant jump to typed letters)
 * - Full detail visibility for technician workloads & zones without clipping
 * - Full touch & keyboard accessibility
 */
export const GlassSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option...',
  icon: Icon = null,
  className = '',
  menuClassName = '',
  disabled = false,
  'aria-label': ariaLabel = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const optionsListRef = useRef(null);
  const typeaheadBufferRef = useRef('');
  const typeaheadTimerRef = useRef(null);
  const dropdownId = useId();

  // Normalize options to { value, label, badge, dotColor, sublabel }
  const normalizedOptions = React.useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          value: opt.value !== undefined ? String(opt.value) : '',
          label: opt.label || opt.name || String(opt.value || ''),
          badge: opt.badge || null,
          dotColor: opt.dotColor || null,
          sublabel: opt.sublabel || null,
          disabled: Boolean(opt.disabled)
        };
      }
      return {
        value: String(opt),
        label: String(opt),
        badge: null,
        dotColor: null,
        sublabel: null,
        disabled: false
      };
    });
  }, [options]);

  const selectedOption = normalizedOptions.find(opt => String(opt.value) === String(value));

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('touchstart', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('touchstart', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Keyboard Typeahead: Jump directly to option when user types keys (no dedicated input box)
  useEffect(() => {
    if (!isOpen) return;

    const handleTypeahead = (e) => {
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'Enter' || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      // Single character keypress
      if (e.key && e.key.length === 1) {
        typeaheadBufferRef.current += e.key.toLowerCase();
        if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
        typeaheadTimerRef.current = setTimeout(() => {
          typeaheadBufferRef.current = '';
        }, 750);

        const query = typeaheadBufferRef.current;
        const matched = normalizedOptions.find(opt => 
          opt.label.toLowerCase().startsWith(query) || 
          opt.label.toLowerCase().includes(query)
        );

        if (matched) {
          const btn = document.getElementById(`${dropdownId}-opt-${matched.value}`);
          if (btn) {
            btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            btn.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleTypeahead);
    return () => {
      window.removeEventListener('keydown', handleTypeahead);
      if (typeaheadTimerRef.current) clearTimeout(typeaheadTimerRef.current);
    };
  }, [isOpen, normalizedOptions, dropdownId]);

  const handleSelect = (optVal) => {
    if (onChange) onChange(optVal);
    setIsOpen(false);
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative inline-block text-left select-none ${className}`}
    >
      {/* Trigger Button */}
      <button
        type="button"
        id={dropdownId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        onClick={() => setIsOpen(prev => !prev)}
        className={`w-full text-xs font-bold px-3 py-2 rounded-xl transition-all duration-200 flex items-center justify-between gap-2.5 outline-none cursor-pointer ${
          isOpen
            ? 'apple-glass-trigger-active ring-2 ring-emerald-500/40 border-emerald-400 shadow-md'
            : 'apple-glass-trigger hover:shadow-xs'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 truncate">
          {Icon && <Icon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
          {selectedOption?.dotColor && (
            <span 
              className="w-2 h-2 rounded-full shrink-0 shadow-2xs" 
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          )}
          <span className="truncate text-slate-800 font-bold">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
              {selectedOption.badge}
            </span>
          )}
        </div>

        <ChevronDown 
          className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-300 ease-apple-spring ${
            isOpen ? 'rotate-180 text-emerald-700' : ''
          }`} 
        />
      </button>

      {/* Apple Frosted Glass Floating Popover (Spring / Jelly Motion) */}
      {isOpen && (
        <div 
          role="listbox"
          aria-labelledby={dropdownId}
          className={`absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-max min-w-full sm:min-w-[340px] md:min-w-[420px] max-w-[min(650px,94vw)] apple-glass-dropdown z-50 rounded-2xl overflow-hidden shadow-2xl isolate border border-white/80 ${menuClassName}`}
          style={{
            transformOrigin: 'top center',
            animation: 'appleJellyDropdownEnter 260ms cubic-bezier(0.34, 1.4, 0.64, 1) both'
          }}
        >
          {/* Options List with Apple Tactile Spring Interaction */}
          <div 
            ref={optionsListRef}
            className="max-h-72 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-300"
          >
            {normalizedOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 font-medium">
                No options available
              </div>
            ) : (
              normalizedOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    id={`${dropdownId}-opt-${opt.value}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 transition-all duration-160 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-800 hover:bg-slate-900/5 active:bg-slate-900/10'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {opt.dotColor && (
                        <span 
                          className="w-2 h-2 rounded-full shrink-0 shadow-2xs" 
                          style={{ backgroundColor: opt.dotColor }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-normal leading-snug">{opt.label}</div>
                        {opt.sublabel && (
                          <div className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-slate-500 font-normal'}`}>
                            {opt.sublabel}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                          isSelected 
                            ? 'bg-white/20 text-white' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
