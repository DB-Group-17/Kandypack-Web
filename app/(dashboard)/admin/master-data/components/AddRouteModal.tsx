'use client';

/**
 * @file AddRouteModal.tsx
 * @description Accessible modal dialog for creating a new delivery route with assigned store and coverage areas.
 * Collects Route name, Assigned store, Max delivery time, and dynamic coverage area items.
 * Conforms to Docs/07_content-copy.md §378-379.
 */

import React, { useState } from 'react';
import { NewRoutePayload } from '../types';
import { MOCK_STORES, MOCK_CITIES } from '../mockData';

interface AddRouteModalProps {
  /** Whether the modal dialog is currently visible */
  isOpen: boolean;
  /** Available destination stores list */
  stores?: Array<{ store_id: number; store_name: string; city_id: number; city_name: string }>;
  /** Available cities list */
  cities?: Array<{ city_id: number; city_name: string }>;
  /** Callback when the modal is dismissed */
  onClose: () => void;
  /** Callback when valid route payload is submitted */
  onSubmit: (payload: NewRoutePayload) => Promise<{ success: boolean; error?: string } | void> | void;
}

interface TempAreaRow {
  id: string;
  city_id: number;
  area_name: string;
}

/**
 * AddRouteModal Component
 */
export const AddRouteModal: React.FC<AddRouteModalProps> = ({
  isOpen,
  stores = MOCK_STORES,
  cities = MOCK_CITIES,
  onClose,
  onSubmit,
}) => {
  const availableStores = stores && stores.length > 0 ? stores : MOCK_STORES;
  const availableCities = cities && cities.length > 0 ? cities : MOCK_CITIES;

  const [routeName, setRouteName] = useState('');
  const [storeId, setStoreId] = useState<number>(availableStores[0]?.store_id || 1);
  const [maxHours, setMaxHours] = useState('4.0');
  const [coverageDesc, setCoverageDesc] = useState('');
  const [coverageAreas, setCoverageAreas] = useState<TempAreaRow[]>([
    { id: '1', city_id: availableStores[0]?.city_id || availableCities[0]?.city_id || 2, area_name: '' },
  ]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  /**
   * Adds an empty coverage area row to the form.
   */
  const handleAddAreaRow = () => {
    const selectedStore = availableStores.find((s) => s.store_id === storeId);
    setCoverageAreas((prev) => [
      ...prev,
      {
        id: String(Date.now() + Math.random()),
        city_id: selectedStore ? selectedStore.city_id : availableCities[0]?.city_id || 2,
        area_name: '',
      },
    ]);
  };

  /**
   * Removes a coverage area row by its temporary identifier.
   *
   * @param id Identifier of row to remove
   */
  const handleRemoveAreaRow = (id: string) => {
    if (coverageAreas.length === 1) return; // Keep at least one
    setCoverageAreas((prev) => prev.filter((a) => a.id !== id));
  };

  /**
   * Updates fields within a specific coverage area row.
   *
   * @param id Row identifier
   * @param updates Object containing partial changes
   */
  const handleUpdateAreaRow = (id: string, updates: Partial<TempAreaRow>) => {
    setCoverageAreas((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  /**
   * Validates form and creates new route.
   *
   * @param e Form submit event
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = routeName.trim();
    const parsedHours = parseFloat(maxHours);

    if (!trimmedName || isNaN(parsedHours) || parsedHours <= 0) {
      setErrorMessage('Please provide a valid route name and positive delivery time.');
      return;
    }

    const validAreas = coverageAreas
      .map((a) => ({ city_id: a.city_id, area_name: a.area_name.trim() }))
      .filter((a) => a.area_name.length > 0);

    if (validAreas.length === 0) {
      setErrorMessage('Please specify at least one valid coverage area name.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await onSubmit({
        route_name: trimmedName,
        store_id: storeId,
        max_delivery_time_hours: parsedHours,
        coverage_description: coverageDesc.trim() || undefined,
        coverage_areas: validAreas,
      });

      if (result && typeof result === 'object' && result.success === false) {
        setErrorMessage(result.error || 'Failed to create route.');
        return;
      }

      // Reset and close
      setRouteName('');
      setMaxHours('4.0');
      setCoverageDesc('');
      setCoverageAreas([{ id: '1', city_id: availableStores[0]?.city_id || availableCities[0]?.city_id || 2, area_name: '' }]);
      setErrorMessage(null);
      onClose();
    } catch (err: unknown) {
      console.error('Error submitting route:', err);
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to configure route. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-[#C8C4D7]/30 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#C8C4D7]/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EBE9FE] text-[#4132C7] flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#121C2C]">Add Route</h3>
              <p className="text-[12px] text-[#474554]">
                Create a delivery route and assign coverage areas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#777586] hover:bg-[#F5F5FA] hover:text-[#121C2C]"
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-[#FFF0F0] border border-[#F93C65]/30 rounded-xl flex items-center gap-2 text-[13px] text-[#F93C65]">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Route Name */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Route Name <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="text"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                placeholder="e.g. Colombo Central Express"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Assigned Store */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Assigned Store <span className="text-[#F93C65]">*</span>
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(Number(e.target.value))}
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              >
                {availableStores.map((s) => (
                  <option key={s.store_id} value={s.store_id}>
                    {s.store_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Max delivery time */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Max Delivery Time (Hours) <span className="text-[#F93C65]">*</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)}
                placeholder="4.0"
                required
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider mb-1.5">
                Coverage Summary (Optional)
              </label>
              <input
                type="text"
                value={coverageDesc}
                onChange={(e) => setCoverageDesc(e.target.value)}
                placeholder="e.g. Covers Colombo Fort and Commercial Zone"
                className="w-full h-11 px-3.5 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[13px] text-[#121C2C] focus:outline-none focus:border-[#4132C7] focus:ring-1 focus:ring-[#4132C7]"
              />
            </div>
          </div>

          {/* Dynamic Coverage Areas List */}
          <div className="pt-2 border-t border-[#C8C4D7]/20">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[12px] font-bold text-[#121C2C] uppercase tracking-wider">
                Coverage Areas (City + Area Name)
              </label>
              <button
                type="button"
                onClick={handleAddAreaRow}
                className="text-[12px] font-semibold text-[#4132C7] hover:text-[#3527a8] flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                </svg>
                <span>+ Add coverage area</span>
              </button>
            </div>

            <div className="space-y-2">
              {coverageAreas.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <select
                    value={row.city_id}
                    onChange={(e) =>
                      handleUpdateAreaRow(row.id, { city_id: Number(e.target.value) })
                    }
                    className="w-1/3 h-10 px-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[12px] text-[#121C2C] focus:outline-none focus:border-[#4132C7]"
                  >
                    {availableCities.filter((c) => 'is_destination' in c ? c.is_destination : true).map((c) => (
                      <option key={c.city_id} value={c.city_id}>
                        {c.city_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={row.area_name}
                    onChange={(e) =>
                      handleUpdateAreaRow(row.id, { area_name: e.target.value })
                    }
                    placeholder="e.g. Fort Sector A"
                    required
                    className="flex-1 h-10 px-3 bg-[#F9F9FF] border border-[#C8C4D7]/50 rounded-lg text-[12px] text-[#121C2C] focus:outline-none focus:border-[#4132C7]"
                  />
                  {coverageAreas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAreaRow(row.id)}
                      className="p-2 text-[#F93C65] hover:bg-[#FFF0F0] rounded-lg transition-colors"
                      title="Remove area"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#C8C4D7]/20 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[#C8C4D7] text-[#474554] font-semibold text-[13px] hover:bg-[#F5F5FA] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#4132C7] text-white font-semibold text-[13px] hover:bg-[#3527a8] transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving Route...</span>
                </>
              ) : (
                <span>+ Add Route</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
