'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, ChevronDown, ChevronRight, Edit2, Trash2, X, Save } from 'lucide-react';

interface Category {
    id: string;
    code: string;
    name: string;
    description: string | null;
    ruleCount: number;
}

interface Bracket {
    id?: string;
    minAmount: number;
    maxAmount: number | null;
    rate: number;
    orderIndex: number;
}

interface Rule {
    id: string;
    categoryId: string;
    category: { code: string; name: string };
    name: string;
    objectCode: string;
    rateType: 'FLAT' | 'PROGRESSIVE' | 'MATRIX';
    baseType: string;
    rateValue: number | null;
    multiplier: number | null;
    conditions: object | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    priority: number;
    sourceRef: string | null;
    notes: string | null;
    isActive: boolean;
    brackets: Bracket[];
}

interface RuleFormData {
    id?: string;
    categoryCode: string;
    name: string;
    objectCode: string;
    rateType: 'FLAT' | 'PROGRESSIVE' | 'MATRIX';
    baseType: string;
    valueMode: 'RATE' | 'NOMINAL'; // NEW: for PTKP nominal amounts
    rateValue: string;
    multiplier: string;
    conditions: string;
    effectiveFrom: string;
    effectiveTo: string;
    priority: string;
    sourceRef: string;
    notes: string;
    brackets: { minAmount: string; maxAmount: string; rate: string }[];
}

const emptyFormData: RuleFormData = {
    categoryCode: '',
    name: '',
    objectCode: '',
    rateType: 'FLAT',
    baseType: 'GROSS',
    valueMode: 'RATE',
    rateValue: '',
    multiplier: '',
    conditions: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    priority: '100',
    sourceRef: '',
    notes: '',
    brackets: [],
};

export default function TaxRatesAdminPage() {
    const [activeTab, setActiveTab] = useState<'rules' | 'categories'>('rules');
    const [categories, setCategories] = useState<Category[]>([]);
    const [rules, setRules] = useState<Rule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingRule, setEditingRule] = useState<Rule | null>(null);
    const [formData, setFormData] = useState<RuleFormData>(emptyFormData);

    useEffect(() => {
        fetchCategories();
        fetchRules();
    }, [categoryFilter, activeFilter, searchQuery]);

    async function fetchCategories() {
        try {
            const res = await fetch('/api/tax-rates/categories');
            const data = await res.json();
            if (data.success) {
                setCategories(data.data);
            }
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    }

    async function fetchRules() {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (categoryFilter) params.set('category', categoryFilter);
            if (activeFilter !== 'all') params.set('active', activeFilter === 'active' ? 'true' : 'false');
            if (searchQuery) params.set('q', searchQuery);

            const res = await fetch(`/api/tax-rates/rules?${params}`);
            const data = await res.json();
            if (data.success) {
                setRules(data.data);
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError('Failed to fetch rules');
        } finally {
            setLoading(false);
        }
    }

    function toggleRuleExpand(ruleId: string) {
        const next = new Set(expandedRules);
        if (next.has(ruleId)) {
            next.delete(ruleId);
        } else {
            next.add(ruleId);
        }
        setExpandedRules(next);
    }

    // Check if category uses nominal (like PTKP)
    function isNominalCategory(catCode: string): boolean {
        return catCode === 'PTKP';
    }

    function formatValue(rule: Rule): string {
        if (rule.rateValue === null) return '-';
        // PTKP stores nominal amount, not rate
        if (rule.category.code === 'PTKP') {
            return `Rp ${formatAmount(rule.rateValue)}`;
        }
        return `${(rule.rateValue * 100).toFixed(2)}%`;
    }

    function formatRate(rate: number | null): string {
        if (rate === null) return '-';
        return `${(rate * 100).toFixed(2)}%`;
    }

    function formatAmount(amount: number): string {
        return new Intl.NumberFormat('id-ID').format(amount);
    }

    function formatDate(dateStr: string | null): string {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('id-ID');
    }

    // Open add modal
    function openAddModal() {
        setEditingRule(null);
        setFormData(emptyFormData);
        setShowModal(true);
    }

    // Open edit modal
    function openEditModal(rule: Rule) {
        setEditingRule(rule);
        const isNominal = isNominalCategory(rule.category.code);
        setFormData({
            id: rule.id,
            categoryCode: rule.category.code,
            name: rule.name,
            objectCode: rule.objectCode,
            rateType: rule.rateType,
            baseType: rule.baseType,
            valueMode: isNominal ? 'NOMINAL' : 'RATE',
            rateValue: rule.rateValue !== null ? (isNominal ? rule.rateValue.toString() : (rule.rateValue * 100).toString()) : '',
            multiplier: rule.multiplier !== null ? rule.multiplier.toString() : '',
            conditions: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : '',
            effectiveFrom: rule.effectiveFrom.split('T')[0],
            effectiveTo: rule.effectiveTo?.split('T')[0] || '',
            priority: rule.priority.toString(),
            sourceRef: rule.sourceRef || '',
            notes: rule.notes || '',
            brackets: rule.brackets.map(b => ({
                minAmount: b.minAmount.toString(),
                maxAmount: b.maxAmount?.toString() || '',
                rate: (b.rate * 100).toString(),
            })),
        });
        setShowModal(true);
    }

    // Save rule
    async function handleSave() {
        setSaving(true);
        setError(null);

        try {
            const isNominal = formData.valueMode === 'NOMINAL';
            const rateValue = formData.rateValue
                ? isNominal
                    ? parseFloat(formData.rateValue)
                    : parseFloat(formData.rateValue) / 100
                : null;

            const payload: any = {
                categoryCode: formData.categoryCode,
                name: formData.name,
                objectCode: formData.objectCode,
                rateType: formData.rateType,
                baseType: formData.baseType,
                rateValue,
                multiplier: formData.multiplier ? parseFloat(formData.multiplier) : null,
                conditions: formData.conditions ? JSON.parse(formData.conditions) : null,
                effectiveFrom: formData.effectiveFrom,
                effectiveTo: formData.effectiveTo || null,
                priority: parseInt(formData.priority) || 100,
                sourceRef: formData.sourceRef || null,
                notes: formData.notes || null,
            };

            // Handle brackets
            if (formData.rateType === 'PROGRESSIVE' && formData.brackets.length > 0) {
                payload.brackets = formData.brackets.map(b => ({
                    minAmount: parseFloat(b.minAmount) || 0,
                    maxAmount: b.maxAmount ? parseFloat(b.maxAmount) : null,
                    rate: (parseFloat(b.rate) || 0) / 100,
                }));
            }

            let res;
            if (editingRule) {
                // Update
                res = await fetch(`/api/tax-rates/rules/${editingRule.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                // Create
                res = await fetch('/api/tax-rates/rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json();
            if (data.success) {
                setShowModal(false);
                fetchRules();
            } else {
                setError(data.error || 'Failed to save rule');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to save rule');
        } finally {
            setSaving(false);
        }
    }

    async function handleDisableRule(rule: Rule) {
        if (!confirm(`Disable rule "${rule.name}"?`)) return;

        try {
            const res = await fetch(`/api/tax-rates/rules/${rule.id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                fetchRules();
            }
        } catch (err) {
            setError('Failed to disable rule');
        }
    }

    // Add bracket row
    function addBracket() {
        setFormData({
            ...formData,
            brackets: [...formData.brackets, { minAmount: '', maxAmount: '', rate: '' }],
        });
    }

    // Remove bracket row
    function removeBracket(index: number) {
        setFormData({
            ...formData,
            brackets: formData.brackets.filter((_, i) => i !== index),
        });
    }

    // Update bracket field
    function updateBracket(index: number, field: 'minAmount' | 'maxAmount' | 'rate', value: string) {
        const newBrackets = [...formData.brackets];
        newBrackets[index] = { ...newBrackets[index], [field]: value };
        setFormData({ ...formData, brackets: newBrackets });
    }

    // Handle category change in form
    function handleCategoryChange(code: string) {
        const isNominal = isNominalCategory(code);
        setFormData({
            ...formData,
            categoryCode: code,
            valueMode: isNominal ? 'NOMINAL' : 'RATE',
        });
    }

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navigation */}
            <nav className="border-b border-neutral-800">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <Link href="/chat" className="font-semibold tracking-tight hover:text-emerald-400 transition-colors">TPC AI</Link>
                    <div className="flex gap-6 text-sm">
                        <Link href="/chat" className="text-neutral-400 hover:text-white transition-colors">Chat</Link>
                        <Link href="/documents" className="text-neutral-400 hover:text-white transition-colors">Documents</Link>
                        <Link href="/upload" className="text-neutral-400 hover:text-white transition-colors">Upload</Link>
                        <Link href="/admin/tax-rates" className="text-white">Tax Rates</Link>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-6 py-8">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold">Tax Rate Registry</h1>
                        <p className="text-neutral-500 text-sm mt-1">Manage deterministic tax rates for RAG/agent</p>
                    </div>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Add Rule
                    </button>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="mb-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm flex justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError(null)}>✕</button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-neutral-800">
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'rules' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}
                    >
                        Rules ({rules.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'categories' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-500 hover:text-white'}`}
                    >
                        Categories ({categories.length})
                    </button>
                </div>

                {activeTab === 'rules' && (
                    <>
                        {/* Filters */}
                        <div className="flex gap-4 mb-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                                <input
                                    type="text"
                                    placeholder="Search rules..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:border-neutral-600"
                                />
                            </div>
                            <select
                                value={categoryFilter}
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:border-neutral-600"
                            >
                                <option value="">All Categories</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.code}>{cat.code} - {cat.name}</option>
                                ))}
                            </select>
                            <select
                                value={activeFilter}
                                onChange={(e) => setActiveFilter(e.target.value as any)}
                                className="px-4 py-2 bg-neutral-900 border border-neutral-800 rounded text-sm focus:outline-none focus:border-neutral-600"
                            >
                                <option value="active">Active Only</option>
                                <option value="inactive">Inactive Only</option>
                                <option value="all">All</option>
                            </select>
                        </div>

                        {/* Rules Table */}
                        {loading ? (
                            <div className="text-center py-12 text-neutral-500">Loading...</div>
                        ) : rules.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500">No rules found</div>
                        ) : (
                            <div className="border border-neutral-800 rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-neutral-900">
                                        <tr>
                                            <th className="w-8 px-3 py-3"></th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Name</th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Category</th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Type</th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Value</th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Effective</th>
                                            <th className="px-3 py-3 text-left font-medium text-neutral-400">Source</th>
                                            <th className="w-24 px-3 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800">
                                        {rules.map((rule) => (
                                            <React.Fragment key={rule.id}>
                                                <tr className={`hover:bg-neutral-900/50 transition-colors ${!rule.isActive ? 'opacity-50' : ''}`}>
                                                    <td className="px-3 py-3">
                                                        {rule.brackets.length > 0 && (
                                                            <button onClick={() => toggleRuleExpand(rule.id)} className="p-1 hover:bg-neutral-800 rounded">
                                                                {expandedRules.has(rule.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 font-medium">{rule.name}</td>
                                                    <td className="px-3 py-3">
                                                        <span className="px-2 py-0.5 bg-neutral-800 rounded text-xs">{rule.category.code}</span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className={`px-2 py-0.5 rounded text-xs ${rule.rateType === 'PROGRESSIVE' ? 'bg-purple-900/50 text-purple-300'
                                                            : rule.rateType === 'MATRIX' ? 'bg-amber-900/50 text-amber-300'
                                                                : 'bg-blue-900/50 text-blue-300'
                                                            }`}>{rule.rateType}</span>
                                                    </td>
                                                    <td className="px-3 py-3 font-mono">
                                                        {rule.rateType === 'PROGRESSIVE' ? (
                                                            <span className="text-neutral-400">{rule.brackets.length} brackets</span>
                                                        ) : formatValue(rule)}
                                                    </td>
                                                    <td className="px-3 py-3 text-neutral-400">
                                                        {formatDate(rule.effectiveFrom)}{rule.effectiveTo && ` - ${formatDate(rule.effectiveTo)}`}
                                                    </td>
                                                    <td className="px-3 py-3 text-neutral-500 truncate max-w-[120px]">{rule.sourceRef || '-'}</td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex gap-1">
                                                            <button onClick={() => openEditModal(rule)} className="p-1.5 hover:bg-neutral-800 rounded" title="Edit">
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => handleDisableRule(rule)} className="p-1.5 hover:bg-red-900/50 rounded text-red-400" title="Disable">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {/* Expanded brackets */}
                                                {expandedRules.has(rule.id) && rule.brackets.length > 0 && (
                                                    <tr>
                                                        <td colSpan={8} className="px-3 py-2 bg-neutral-900/50">
                                                            <div className="ml-8 p-3 bg-neutral-900 rounded border border-neutral-800">
                                                                <div className="text-xs text-neutral-500 mb-2">Progressive Brackets</div>
                                                                <table className="w-full text-xs">
                                                                    <thead>
                                                                        <tr className="text-neutral-500">
                                                                            <th className="text-left py-1">Min</th>
                                                                            <th className="text-left py-1">Max</th>
                                                                            <th className="text-left py-1">Rate</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {rule.brackets.map((b, i) => (
                                                                            <tr key={i} className="border-t border-neutral-800">
                                                                                <td className="py-1 font-mono">Rp {formatAmount(b.minAmount)}</td>
                                                                                <td className="py-1 font-mono">{b.maxAmount ? `Rp ${formatAmount(b.maxAmount)}` : '∞'}</td>
                                                                                <td className="py-1 font-mono font-medium">{formatRate(b.rate)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'categories' && (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {categories.map((cat) => (
                            <div key={cat.id} className="p-4 border border-neutral-800 rounded-lg hover:border-neutral-700 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs font-medium">{cat.code}</span>
                                    <span className="text-neutral-500 text-sm">{cat.ruleCount} rules</span>
                                </div>
                                <h3 className="font-medium mb-1">{cat.name}</h3>
                                <p className="text-sm text-neutral-500">{cat.description}</p>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="text-lg font-semibold">{editingRule ? 'Edit Rule' : 'Add New Rule'}</h3>
                            <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                            {/* Row 1: Category & Name */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Category *</label>
                                    <select
                                        value={formData.categoryCode}
                                        onChange={(e) => handleCategoryChange(e.target.value)}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                        required
                                    >
                                        <option value="">Select category...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.code}>{cat.code} - {cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                        placeholder="e.g., PPN Umum 11%"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Row 2: Object Code & Rate Type */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Object Code *</label>
                                    <input
                                        type="text"
                                        value={formData.objectCode}
                                        onChange={(e) => setFormData({ ...formData, objectCode: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono focus:outline-none focus:border-neutral-500"
                                        placeholder="e.g., PPN_GENERAL_11"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Rate Type</label>
                                    <select
                                        value={formData.rateType}
                                        onChange={(e) => setFormData({ ...formData, rateType: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                    >
                                        <option value="FLAT">FLAT</option>
                                        <option value="PROGRESSIVE">PROGRESSIVE</option>
                                        <option value="MATRIX">MATRIX</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 3: Value Mode & Rate Value (for FLAT/MATRIX) */}
                            {formData.rateType !== 'PROGRESSIVE' && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">Value Mode</label>
                                        <select
                                            value={formData.valueMode}
                                            onChange={(e) => setFormData({ ...formData, valueMode: e.target.value as any })}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                        >
                                            <option value="RATE">Rate (%)</option>
                                            <option value="NOMINAL">Nominal (Rp)</option>
                                        </select>
                                        <p className="text-xs text-neutral-500 mt-1">
                                            {formData.valueMode === 'RATE' ? 'Use for tax rates (e.g., 11%)' : 'Use for fixed amounts (e.g., PTKP)'}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-neutral-400 mb-1">
                                            {formData.valueMode === 'RATE' ? 'Rate (%)' : 'Amount (Rp)'}
                                        </label>
                                        <input
                                            type="number"
                                            step={formData.valueMode === 'RATE' ? '0.01' : '1'}
                                            value={formData.rateValue}
                                            onChange={(e) => setFormData({ ...formData, rateValue: e.target.value })}
                                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono focus:outline-none focus:border-neutral-500"
                                            placeholder={formData.valueMode === 'RATE' ? 'e.g., 11 for 11%' : 'e.g., 54000000'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Progressive Brackets */}
                            {formData.rateType === 'PROGRESSIVE' && (
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-2">Progressive Brackets</label>
                                    <div className="space-y-2">
                                        {formData.brackets.map((b, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <input
                                                    type="number"
                                                    placeholder="Min (Rp)"
                                                    value={b.minAmount}
                                                    onChange={(e) => updateBracket(i, 'minAmount', e.target.value)}
                                                    className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono"
                                                />
                                                <input
                                                    type="number"
                                                    placeholder="Max (Rp, empty=∞)"
                                                    value={b.maxAmount}
                                                    onChange={(e) => updateBracket(i, 'maxAmount', e.target.value)}
                                                    className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono"
                                                />
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="Rate %"
                                                    value={b.rate}
                                                    onChange={(e) => updateBracket(i, 'rate', e.target.value)}
                                                    className="w-24 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeBracket(i)}
                                                    className="p-2 text-red-400 hover:bg-red-900/30 rounded"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addBracket}
                                        className="mt-2 text-sm text-blue-400 hover:text-blue-300"
                                    >
                                        + Add Bracket
                                    </button>
                                </div>
                            )}

                            {/* Row 4: Effective Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Effective From *</label>
                                    <input
                                        type="date"
                                        value={formData.effectiveFrom}
                                        onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Effective To (optional)</label>
                                    <input
                                        type="date"
                                        value={formData.effectiveTo}
                                        onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                    />
                                </div>
                            </div>

                            {/* Row 5: Priority & Base Type */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Priority</label>
                                    <input
                                        type="number"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                        placeholder="100"
                                    />
                                    <p className="text-xs text-neutral-500 mt-1">Higher priority wins when multiple rules match</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral-400 mb-1">Base Type</label>
                                    <select
                                        value={formData.baseType}
                                        onChange={(e) => setFormData({ ...formData, baseType: e.target.value })}
                                        className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                    >
                                        <option value="GROSS">GROSS (Bruto)</option>
                                        <option value="NET">NET (Neto/PKP)</option>
                                        <option value="DPP">DPP</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 6: Source Reference */}
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Source Reference</label>
                                <input
                                    type="text"
                                    value={formData.sourceRef}
                                    onChange={(e) => setFormData({ ...formData, sourceRef: e.target.value })}
                                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                    placeholder="e.g., UU HPP No. 7/2021"
                                />
                            </div>

                            {/* Row 7: Notes */}
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Notes</label>
                                <textarea
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm focus:outline-none focus:border-neutral-500"
                                    rows={2}
                                    placeholder="Optional notes..."
                                />
                            </div>

                            {/* Row 8: Conditions (JSON) */}
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Conditions (JSON, optional)</label>
                                <textarea
                                    value={formData.conditions}
                                    onChange={(e) => setFormData({ ...formData, conditions: e.target.value })}
                                    className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono focus:outline-none focus:border-neutral-500"
                                    rows={3}
                                    placeholder='{"hasNpwp": true, "incomeType": "JASA"}'
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-4 border-t border-neutral-800">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 border border-neutral-700 rounded font-medium text-sm hover:border-neutral-500"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded font-medium text-sm flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {saving ? 'Saving...' : 'Save Rule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
