import React, { useState, useRef, useEffect, useId } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

/**
 * AppleGlassSelect — Premium Liquid Glass Dropdown
 * 
 * Replaces native OS <select> with an authentic Apple-grade frosted glass experience:
 * - Fluid spring/jelly physics (smooth expansion & collapse)
 * - Translucent backdrop blur with specular glass reflections
 * - Full touch & keyboard accessibility
 * - Prevents native mobile browser wheel/sheet popups
 */
export const GlassSelect = ({
  value,
  onChange,
  options = [],
  placeholder = 'Select an option...',
  icon: Icon = null,
  className = '',
  menuClassName = '',
  searchable = false,
  disabled = false,
  'aria-label': ariaLabel = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
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

  // Filtered options if search is enabled
  const filteredOptions = React.useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(opt => 
      opt.label.toLowerCase().includes(q) || 
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
      (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchQuery]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
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

  // Focus search when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, searchable]);

  const handleSelect = (optVal) => {
    if (onChange) onChange(optVal);
    setIsOpen(false);
    setSearchQuery('');
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
          className={`absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-full min-w-[240px] max-w-[360px] sm:max-w-md apple-glass-dropdown z-50 rounded-2xl overflow-hidden shadow-2xl isolate border border-white/80 ${menuClassName}`}
          style={{
            transformOrigin: 'top center',
            animation: 'appleJellyDropdownEnter 260ms cubic-bezier(0.34, 1.4, 0.64, 1) both'
          }}
        >
          {/* Optional Search Filter */}
          {searchable && normalizedOptions.length > 5 && (
            <div className="p-2 border-b border-slate-200/60 bg-white/50 backdrop-blur-md">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search options..."
                  className="w-full text-xs pl-8 pr-7 py-1.5 bg-slate-100/80 focus:bg-white rounded-lg border border-slate-200/80 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-medium text-slate-800 transition-all placeholder:text-slate-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options List with Apple Tactile Spring Interaction */}
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-300">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 font-medium">
                No matching options found
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2 transition-all duration-160 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-800 hover:bg-slate-900/5 active:bg-slate-900/10'
                    } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {opt.dotColor && (
                        <span 
                          className="w-2 h-2 rounded-full shrink-0 shadow-2xs" 
                          style={{ backgroundColor: opt.dotColor }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="truncate">{opt.label}</div>
                        {opt.sublabel && (
                          <div className={`text-[10px] truncate ${isSelected ? 'text-emerald-100' : 'text-slate-500 font-normal'}`}>
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
