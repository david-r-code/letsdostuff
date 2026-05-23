'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sparkles, Plus, Trash2, ChevronDown, ChevronUp,
  Lock, Eye, Handshake, Loader2, MapPin,
} from 'lucide-react'
import type {
  ListingCriterion, CriterionType, CriterionEnforcement, CriterionData,
  GenderCriterionData, SkillCriterionData, GeoCriterionData,
  MinAgeCriterionData, CustomCriterionData, SkillLevel, Gender,
} from '@/types/database'
import type { PickedLocation } from '@/components/map/location-picker'

// Lazy-load map to avoid SSR
const LocationPicker = dynamic(
  () => import('@/components/map/location-picker').then(m => m.LocationPicker),
  { ssr: false }
)

type DraftCriterion = Omit<ListingCriterion, 'id' | 'listing_id'>

const ENFORCEMENT_LABELS: Record<CriterionEnforcement, { icon: React.ReactNode; label: string; desc: string }> = {
  auto: { icon: <Lock className="h-3.5 w-3.5" />, label: 'Auto-enforced', desc: 'System checks this automatically' },
  display: { icon: <Eye className="h-3.5 w-3.5" />, label: 'Displayed', desc: 'Shown to applicants, manually reviewed' },
  honor: { icon: <Handshake className="h-3.5 w-3.5" />, label: 'Honor system', desc: 'Shown, self-declared by applicants' },
}

const SKILL_LEVELS: SkillLevel[] = ['any', 'beginner', 'intermediate', 'advanced', 'expert']
const GENDER_OPTIONS: Array<{ value: Gender | 'any'; label: string }> = [
  { value: 'any', label: 'Any gender' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other / Non-binary' },
]

interface CriteriaBuilderProps {
  value: DraftCriterion[]
  onChange: (criteria: DraftCriterion[]) => void
}

export function CriteriaBuilder({ value, onChange }: CriteriaBuilderProps) {
  const [freeText, setFreeText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const extractCriteria = async () => {
    if (!freeText.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/listings/extract-criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: freeText }),
      })
      const { criteria } = await res.json()
      if (criteria?.length) {
        // Merge: keep existing, append new ones that aren't duplicates
        const merged = [...value]
        for (const c of criteria as DraftCriterion[]) {
          const isDup = merged.some(
            m => m.criteria_type === c.criteria_type &&
              JSON.stringify(m.data) === JSON.stringify(c.data)
          )
          if (!isDup) merged.push({ ...c, sort_order: merged.length })
        }
        onChange(merged)
      }
    } finally {
      setExtracting(false)
    }
  }

  const updateCriterion = (index: number, updates: Partial<DraftCriterion>) => {
    onChange(value.map((c, i) => i === index ? { ...c, ...updates } : c))
  }

  const removeCriterion = (index: number) => {
    onChange(value.filter((_, i) => i !== index).map((c, i) => ({ ...c, sort_order: i })))
  }

  const addManual = (type: CriterionType) => {
    const defaults: Record<CriterionType, { label: string; data: CriterionData; enforcement: CriterionEnforcement }> = {
      gender:  { label: 'Gender preference', data: { value: 'any' } as GenderCriterionData, enforcement: 'auto' },
      skill:   { label: 'Skill requirement', data: { name: '', min_level: 'any' } as SkillCriterionData, enforcement: 'display' },
      geo:     { label: 'Location proximity', data: { travel_mode: 'driving', distance_value: 30, distance_unit: 'minutes', location_label: '', location_lat: 0, location_lng: 0 } as GeoCriterionData, enforcement: 'auto' },
      min_age: { label: 'Minimum age', data: { min_age: 18 } as MinAgeCriterionData, enforcement: 'display' },
      custom:  { label: 'Other requirement', data: { text: '' } as CustomCriterionData, enforcement: 'display' },
    }
    const d = defaults[type]
    onChange([...value, { ...d, criteria_type: type, sort_order: value.length }])
    setExpanded(`new-${value.length}`)
  }

  return (
    <div className="space-y-4">
      {/* AI extraction */}
      <div className="space-y-2">
        <Label>Describe who you&apos;re looking for</Label>
        <Textarea
          placeholder='e.g. "Looking for women with 2+ years of surfing experience who live within 30 driving minutes of Malibu. Must be 18+. Comfortable in open water."'
          value={freeText}
          onChange={e => setFreeText(e.target.value)}
          rows={4}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={extractCriteria}
          disabled={extracting || !freeText.trim()}
          className="gap-2"
        >
          {extracting
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</>
            : <><Sparkles className="h-4 w-4" /> Extract criteria with AI</>
          }
        </Button>
        <p className="text-xs text-muted-foreground">
          AI will identify structured criteria. You can review and adjust each one below.
        </p>
      </div>

      {value.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Extracted criteria ({value.length})</Label>
            </div>

            {value.map((criterion, index) => {
              const key = `${criterion.criteria_type}-${index}`
              const isExpanded = expanded === key || expanded === `new-${index}`
              const enforcementInfo = ENFORCEMENT_LABELS[criterion.enforcement]

              return (
                <div key={key} className="border rounded-lg overflow-hidden">
                  {/* Header row */}
                  <div className="flex items-center gap-2 p-3 bg-muted/30">
                    <CriterionTypeBadge type={criterion.criteria_type} />
                    <span className="flex-1 text-sm font-medium">{criterion.label}</span>
                    <Badge
                      variant="outline"
                      className="gap-1 text-xs cursor-pointer"
                      onClick={() => {
                        const next: Record<CriterionEnforcement, CriterionEnforcement> = {
                          auto: 'display', display: 'honor', honor: 'auto',
                        }
                        updateCriterion(index, { enforcement: next[criterion.enforcement] })
                      }}
                    >
                      {enforcementInfo.icon}
                      {enforcementInfo.label}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : key)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeCriterion(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {isExpanded && (
                    <div className="p-3 border-t space-y-3">
                      {/* Enforcement picker */}
                      <div className="space-y-1">
                        <Label className="text-xs">Enforcement</Label>
                        <div className="flex gap-2">
                          {(Object.entries(ENFORCEMENT_LABELS) as [CriterionEnforcement, typeof ENFORCEMENT_LABELS[CriterionEnforcement]][]).map(([key, info]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => updateCriterion(index, { enforcement: key })}
                              className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
                                criterion.enforcement === key
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'border-border hover:border-muted-foreground'
                              }`}
                            >
                              {info.icon}
                              <span className="font-medium">{info.label}</span>
                              <span className="text-muted-foreground text-center leading-tight">{info.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Label */}
                      <div className="space-y-1">
                        <Label className="text-xs">Display label</Label>
                        <Input
                          value={criterion.label}
                          onChange={e => updateCriterion(index, { label: e.target.value })}
                          placeholder="How this appears to applicants"
                        />
                      </div>

                      {/* Type-specific data editors */}
                      <CriterionDataEditor
                        type={criterion.criteria_type}
                        data={criterion.data}
                        onChange={data => updateCriterion(index, { data })}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Manual add */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-muted-foreground self-center">Add manually:</span>
        {(['gender', 'skill', 'geo', 'min_age', 'custom'] as CriterionType[]).map(type => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            className="gap-1 h-7 text-xs"
            onClick={() => addManual(type)}
          >
            <Plus className="h-3 w-3" />
            {type === 'min_age' ? 'Min age' : type === 'custom' ? 'Other' : type.charAt(0).toUpperCase() + type.slice(1)}
          </Button>
        ))}
      </div>
    </div>
  )
}

function CriterionTypeBadge({ type }: { type: CriterionType }) {
  const colors: Record<CriterionType, string> = {
    gender: 'bg-purple-100 text-purple-700',
    skill: 'bg-blue-100 text-blue-700',
    geo: 'bg-green-100 text-green-700',
    min_age: 'bg-orange-100 text-orange-700',
    custom: 'bg-gray-100 text-gray-600',
  }
  const labels: Record<CriterionType, string> = {
    gender: 'Gender', skill: 'Skill', geo: 'Location', min_age: 'Age', custom: 'Other',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[type]}`}>
      {labels[type]}
    </span>
  )
}

function CriterionDataEditor({
  type, data, onChange,
}: {
  type: CriterionType
  data: CriterionData
  onChange: (d: CriterionData) => void
}) {
  if (type === 'gender') {
    const d = data as GenderCriterionData
    return (
      <div className="space-y-1">
        <Label className="text-xs">Gender</Label>
        <Select value={d.value} onValueChange={v => onChange({ value: v as Gender | 'any' })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GENDER_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (type === 'skill') {
    const d = data as SkillCriterionData
    return (
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-xs">Skill name</Label>
          <Input
            value={d.name}
            onChange={e => onChange({ ...d, name: e.target.value })}
            placeholder="e.g. Surfing, Python, Yoga"
          />
        </div>
        <div className="w-36 space-y-1">
          <Label className="text-xs">Minimum level</Label>
          <Select value={d.min_level} onValueChange={v => onChange({ ...d, min_level: v as SkillLevel })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SKILL_LEVELS.map(l => (
                <SelectItem key={l} value={l} className="capitalize">{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }

  if (type === 'geo') {
    const d = data as GeoCriterionData
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Distance</Label>
            <Input
              type="number"
              min={1}
              className="w-24"
              value={d.distance_value}
              onChange={e => onChange({ ...d, distance_value: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Select value={d.distance_unit} onValueChange={v => onChange({ ...d, distance_unit: v as 'minutes' | 'hours' })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">minutes</SelectItem>
                <SelectItem value="hours">hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">By</Label>
            <Select value={d.travel_mode} onValueChange={v => onChange({ ...d, travel_mode: v as 'driving' | 'walking' })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="driving">driving</SelectItem>
                <SelectItem value="walking">walking</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1">
            <MapPin className="h-3 w-3" /> Reference location
          </Label>
          <LocationPicker
            height="200px"
            value={d.location_lat && d.location_lng
              ? { lat: d.location_lat, lng: d.location_lng, label: d.location_label }
              : null
            }
            onChange={(loc: PickedLocation) => onChange({
              ...d,
              location_lat: loc.lat,
              location_lng: loc.lng,
              location_label: loc.label,
            })}
            placeholder="Search for reference location…"
          />
          <p className="text-xs text-muted-foreground">
            Displayed as: within {d.distance_value} {d.distance_unit} {d.travel_mode} from {d.location_label || '…'}
          </p>
        </div>
      </div>
    )
  }

  if (type === 'min_age') {
    const d = data as MinAgeCriterionData
    return (
      <div className="space-y-1">
        <Label className="text-xs">Minimum age</Label>
        <Input
          type="number"
          min={1}
          max={120}
          className="w-24"
          value={d.min_age}
          onChange={e => onChange({ min_age: Number(e.target.value) })}
        />
      </div>
    )
  }

  // custom
  const d = data as CustomCriterionData
  return (
    <div className="space-y-1">
      <Label className="text-xs">Requirement description</Label>
      <Textarea
        value={d.text}
        onChange={e => onChange({ text: e.target.value })}
        placeholder="Describe the requirement…"
        rows={2}
      />
    </div>
  )
}
