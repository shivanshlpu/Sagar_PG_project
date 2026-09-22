import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Phone,
  Bed,
  Upload,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  FileCheck,
  Building2,
  GraduationCap,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField, Input, Select, Textarea } from '../components/ui/FormField';
import { apiGet, apiUpload } from '../lib/api';
import { compressImage } from '../lib/imageCompressor';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../context/LanguageContext';

interface AvailableRoom {
  id: string;
  room_number: string;
  floor: number;
  room_type: string;
  base_rent_paise: number;
  beds: Array<{ id: string; bed_number: string; status: string }>;
}

const onboardingSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Valid 10-digit phone number is required'),
  gender: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Please select gender' }) }),
  date_of_birth: z.string().min(1, 'Date of birth is required'),
  permanent_address: z.string().min(5, 'Permanent address is required'),
  emergency_contact_name: z.string().min(2, 'Emergency contact name is required'),
  emergency_contact_phone: z.string().min(10, 'Valid 10-digit emergency phone is required'),
  college_name: z.string().min(2, 'College / Institute name is required'),
  id_proof_number: z.string().min(12, 'Valid 12-digit Aadhaar number is required'),
  room_id: z.string().min(1, 'Please select your room'),
  bed_id: z.string().min(1, 'Please select your bed'),
  move_in_date: z.string().min(1, 'Move-in date is required'),
});

type OnboardingFormData = z.infer<typeof onboardingSchema>;

interface TenantOnboardingProps {
  onComplete: () => void;
}

export function TenantOnboarding({ onComplete }: TenantOnboardingProps) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [currentStep, setCurrentStep] = useState(1);
  const [rooms, setRooms] = useState<AvailableRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Document Files & Previews
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [aadhaarPreview, setAadhaarPreview] = useState<string | null>(null);
  const [aadhaarError, setAadhaarError] = useState('');

  const [collegeFile, setCollegeFile] = useState<File | null>(null);
  const [collegePreview, setCollegePreview] = useState<string | null>(null);
  const [collegeError, setCollegeError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      full_name: (user as any)?.tenant?.full_name || '',
      phone: (user as any)?.tenant?.phone || '',
      gender: ((user as any)?.tenant?.gender as any) || 'male',
      date_of_birth: (user as any)?.tenant?.date_of_birth?.split('T')[0] || '',
      permanent_address: (user as any)?.tenant?.permanent_address || '',
      emergency_contact_name: (user as any)?.tenant?.emergency_contact_name || '',
      emergency_contact_phone: (user as any)?.tenant?.emergency_contact_phone || '',
      college_name: '',
      id_proof_number: (user as any)?.tenant?.id_proof_number || '',
      room_id: (user as any)?.tenant?.room_id || '',
      bed_id: (user as any)?.tenant?.bed_id || '',
      move_in_date: new Date().toISOString().split('T')[0],
    },
  });

  const selectedRoomId = watch('room_id');
  const selectedBedId = watch('bed_id');
  const watchedValues = watch();

  // Load available rooms and vacant beds
  useEffect(() => {
    async function loadRooms() {
      setIsLoadingRooms(true);
      try {
        const res = await apiGet<AvailableRoom[]>('/rooms/available');
        if (res.success && res.data) {
          setRooms(res.data);
        }
      } catch (err) {
        console.error('Failed to load available rooms:', err);
      } finally {
        setIsLoadingRooms(false);
      }
    }
    loadRooms();
  }, []);

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const availableBeds = selectedRoom?.beds || [];

  // File Upload Handlers with Automatic Client Compression
  const handleAadhaarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAadhaarError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setAadhaarError('File exceeds 15MB limit. Please choose a smaller image.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setAadhaarError('Only JPG, PNG, WEBP, or PDF files are allowed.');
      return;
    }

    try {
      const processedFile = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
      setAadhaarFile(processedFile);
      if (processedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setAadhaarPreview(reader.result as string);
        reader.readAsDataURL(processedFile);
      } else {
        setAadhaarPreview(null);
      }
    } catch {
      setAadhaarFile(file);
    }
  };

  const handleCollegeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCollegeError('');
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setCollegeError('File exceeds 15MB limit. Please choose a smaller image.');
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) {
      setCollegeError('Only JPG, PNG, WEBP, or PDF files are allowed.');
      return;
    }

    try {
      const processedFile = await compressImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.75 });
      setCollegeFile(processedFile);
      if (processedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => setCollegePreview(reader.result as string);
        reader.readAsDataURL(processedFile);
      } else {
        setCollegePreview(null);
      }
    } catch {
      setCollegeFile(file);
    }
  };

  // Step Validation before advancing
  const handleNextStep = async () => {
    let isValid = false;

    if (currentStep === 1) {
      isValid = await trigger(['full_name', 'phone', 'gender', 'date_of_birth', 'permanent_address']);
    } else if (currentStep === 2) {
      isValid = await trigger(['emergency_contact_name', 'emergency_contact_phone', 'college_name', 'id_proof_number']);
    } else if (currentStep === 3) {
      isValid = await trigger(['room_id', 'bed_id', 'move_in_date']);
    } else if (currentStep === 4) {
      let docValid = true;
      if (!aadhaarFile) {
        setAadhaarError('Aadhaar Card image is mandatory');
        docValid = false;
      }
      if (!collegeFile) {
        setCollegeError('College / Student ID image is mandatory');
        docValid = false;
      }
      isValid = docValid;
    }

    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const onSubmit = async (data: OnboardingFormData) => {
    if (!aadhaarFile || !collegeFile) {
      setSubmitError('Both Aadhaar Card and College ID images are mandatory.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError('');

      const formData = new FormData();
      formData.append('full_name', data.full_name);
      formData.append('phone', data.phone);
      formData.append('gender', data.gender);
      formData.append('date_of_birth', data.date_of_birth);
      formData.append('permanent_address', data.permanent_address);
      formData.append('emergency_contact_name', data.emergency_contact_name);
      formData.append('emergency_contact_phone', data.emergency_contact_phone);
      formData.append('college_name', data.college_name);
      formData.append('id_proof_number', data.id_proof_number);
      formData.append('room_id', data.room_id);
      formData.append('bed_id', data.bed_id);
      formData.append('move_in_date', data.move_in_date);

      formData.append('aadhaar_card', aadhaarFile);
      formData.append('college_id', collegeFile);

      const res = await apiUpload('/tenants/self-onboarding', formData);

      if (res.success) {
        onComplete();
      } else {
        setSubmitError(res.error || 'Failed to complete onboarding. Please check all fields.');
      }
    } catch (err: any) {
      setSubmitError(err?.message || 'Connection error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepLabels = [
    { num: 1, label: language === 'hi' ? 'व्यक्तिगत विवरण' : 'Personal Info', icon: User },
    { num: 2, label: language === 'hi' ? 'आपातकालीन व कॉलेज' : 'Emergency & College', icon: Phone },
    { num: 3, label: language === 'hi' ? 'कमरा व बिस्तर' : 'Room & Bed', icon: Bed },
    { num: 4, label: language === 'hi' ? 'पहचान पत्र (IDs)' : 'ID Documents', icon: Upload },
    { num: 5, label: language === 'hi' ? 'पुष्टि करें' : 'Confirm', icon: CheckCircle2 },
  ];

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '12px',
          backgroundColor: 'var(--color-primary-light)',
          color: 'var(--color-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '12px',
          border: '1px solid rgba(15, 118, 110, 0.2)',
        }}>
          <Building2 size={26} />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {language === 'hi' ? 'किरायेदार ऑनबोर्डिंग फॉर्म' : 'Complete Tenant Onboarding'}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          {language === 'hi'
            ? 'डैशबोर्ड का उपयोग करने के लिए कृपया अपनी पूरी जानकारी और आईडी कार्ड अपलोड करें।'
            : 'Please complete your room selection and upload your ID documents to access your tenant dashboard.'}
        </p>
      </div>

      {/* Progress Stepper Bar */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>
            Step {currentStep} of 5: {stepLabels[currentStep - 1]?.label}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            {Math.round((currentStep / 5) * 100)}%
          </span>
        </div>
        <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--color-bg-surface-alt)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(currentStep / 5) * 100}%`,
            backgroundColor: 'var(--color-primary)',
            borderRadius: 'var(--radius-full)',
            transition: 'width 250ms ease',
          }} />
        </div>
      </div>

      {submitError && (
        <div style={{
          backgroundColor: 'var(--color-danger-light)',
          color: 'var(--color-danger)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '20px',
          fontSize: 'var(--font-size-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <span>{submitError}</span>
        </div>
      )}

      <Card padding="lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* STEP 1: Personal Details */}
          {currentStep === 1 && (
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>
                1. {language === 'hi' ? 'व्यक्तिगत जानकारी' : 'Personal Details'}
              </h2>

              <FormField label={language === 'hi' ? 'पूरा नाम' : 'Full Name'} error={errors.full_name?.message} required>
                <Input placeholder="e.g. Rahul Sharma" {...register('full_name')} error={!!errors.full_name} />
              </FormField>

              <div className="form-grid-2">
                <FormField label={language === 'hi' ? 'मोबाइल नंबर' : 'Phone Number'} error={errors.phone?.message} required>
                  <Input type="tel" placeholder="10-digit mobile" {...register('phone')} error={!!errors.phone} />
                </FormField>

                <FormField label={language === 'hi' ? 'लिंग' : 'Gender'} error={errors.gender?.message} required>
                  <Select
                    options={[
                      { value: 'male', label: language === 'hi' ? 'पुरुष (Male)' : 'Male' },
                      { value: 'female', label: language === 'hi' ? 'महिला (Female)' : 'Female' },
                      { value: 'other', label: language === 'hi' ? 'अन्य (Other)' : 'Other' },
                    ]}
                    {...register('gender')}
                  />
                </FormField>
              </div>

              <div className="form-grid-2">
                <FormField label={language === 'hi' ? 'जन्म तिथि' : 'Date of Birth'} error={errors.date_of_birth?.message} required>
                  <Input type="date" {...register('date_of_birth')} error={!!errors.date_of_birth} />
                </FormField>
              </div>

              <FormField label={language === 'hi' ? 'स्थायी पता' : 'Permanent Home Address'} error={errors.permanent_address?.message} required>
                <Textarea rows={3} placeholder="Full residential address with city, state & pin" {...register('permanent_address')} error={!!errors.permanent_address} />
              </FormField>
            </div>
          )}

          {/* STEP 2: Emergency Contact & College Info */}
          {currentStep === 2 && (
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>
                2. {language === 'hi' ? 'आपातकालीन संपर्क व कॉलेज' : 'Emergency Contact & College/Work'}
              </h2>

              <div className="form-grid-2">
                <FormField label={language === 'hi' ? 'आपातकालीन संपर्क का नाम' : 'Emergency Contact Name'} error={errors.emergency_contact_name?.message} required>
                  <Input placeholder="e.g. Suresh Sharma (Father)" {...register('emergency_contact_name')} error={!!errors.emergency_contact_name} />
                </FormField>

                <FormField label={language === 'hi' ? 'आपातकालीन फोन' : 'Emergency Contact Phone'} error={errors.emergency_contact_phone?.message} required>
                  <Input type="tel" placeholder="10-digit phone number" {...register('emergency_contact_phone')} error={!!errors.emergency_contact_phone} />
                </FormField>
              </div>

              <FormField label={language === 'hi' ? 'कॉलेज / संस्थान / कंपनी का नाम' : 'College / Institute / Company Name'} error={errors.college_name?.message} required>
                <Input placeholder="e.g. Delhi University / Infosys" {...register('college_name')} error={!!errors.college_name} />
              </FormField>

              <FormField label={language === 'hi' ? 'आधार कार्ड नंबर' : 'Aadhaar Card Number'} error={errors.id_proof_number?.message} required>
                <Input placeholder="12-digit Aadhaar number" {...register('id_proof_number')} error={!!errors.id_proof_number} />
              </FormField>
            </div>
          )}

          {/* STEP 3: Room & Bed Selection */}
          {currentStep === 3 && (
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>
                3. {language === 'hi' ? 'कमरा और बिस्तर चुनें' : 'Select Your Room & Bed'}
              </h2>

              {isLoadingRooms ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="skeleton" style={{ height: '44px', borderRadius: 'var(--radius-md)' }} />
                  <div className="skeleton" style={{ height: '44px', borderRadius: 'var(--radius-md)' }} />
                </div>
              ) : rooms.length === 0 ? (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: 'var(--color-bg-surface-alt)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-secondary)',
                }}>
                  <p style={{ fontWeight: 600 }}>No vacant rooms available currently.</p>
                  <p style={{ fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>Please contact the PG manager for bed assignment.</p>
                </div>
              ) : (
                <>
                  <div className="form-grid-2">
                    <FormField label={language === 'hi' ? 'कमरा चुनें' : 'Select Room'} error={errors.room_id?.message} required>
                      <Select
                        options={[
                          { value: '', label: '— Choose Room —' },
                          ...rooms.map((r) => ({
                            value: r.id,
                            label: `Room ${r.room_number} (Floor ${r.floor}) - ₹${(r.base_rent_paise / 100).toLocaleString('en-IN')}/mo`,
                          })),
                        ]}
                        {...register('room_id')}
                        onChange={(e) => {
                          register('room_id').onChange(e);
                          setValue('bed_id', '');
                        }}
                      />
                    </FormField>

                    <FormField label={language === 'hi' ? 'खाली बिस्तर चुनें' : 'Select Vacant Bed'} error={errors.bed_id?.message} required>
                      <Select
                        disabled={!selectedRoomId}
                        options={[
                          { value: '', label: availableBeds.length > 0 ? '— Choose Bed —' : 'No vacant beds' },
                          ...availableBeds.map((b) => ({
                            value: b.id,
                            label: `Bed ${b.bed_number}`,
                          })),
                        ]}
                        {...register('bed_id')}
                      />
                    </FormField>
                  </div>

                  <FormField label={language === 'hi' ? 'प्रवेश की तारीख (Move-in Date)' : 'Move-In Date'} error={errors.move_in_date?.message} required>
                    <Input type="date" {...register('move_in_date')} error={!!errors.move_in_date} />
                  </FormField>
                </>
              )}
            </div>
          )}

          {/* STEP 4: Mandatory Document Uploads */}
          {currentStep === 4 && (
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '6px' }}>
                4. {language === 'hi' ? 'अनिवार्य पहचान पत्र अपलोड करें' : 'Mandatory Document Uploads'}
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: '20px' }}>
                {language === 'hi'
                  ? 'सुरक्षा और सत्यापन के लिए आधार कार्ड और कॉलेज आईडी की फोटो अनिवार्य है (अधिकतम 2MB)।'
                  : 'For security and address verification, both Aadhaar Card and College ID images are mandatory (Max 2MB each).'}
              </p>

              {/* Aadhaar Card Upload */}
              <div style={{
                border: aadhaarError ? '2px solid var(--color-danger)' : '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                marginBottom: '20px',
                backgroundColor: 'var(--color-bg-surface-alt)',
                textAlign: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <FileCheck size={20} style={{ color: aadhaarFile ? 'var(--color-success)' : 'var(--color-primary)' }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>
                    {language === 'hi' ? 'आधार कार्ड की फोटो *' : 'Aadhaar Card Photo *'}
                  </span>
                </div>

                {aadhaarPreview && (
                  <div style={{ margin: '12px auto', maxWidth: '240px' }}>
                    <img
                      src={aadhaarPreview}
                      alt="Aadhaar preview"
                      style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                )}

                <input
                  type="file"
                  id="aadhaar-upload"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleAadhaarChange}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="aadhaar-upload"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginTop: '8px',
                  }}
                >
                  <Upload size={16} />
                  <span>{aadhaarFile ? (language === 'hi' ? 'फ़ाइल बदलें' : 'Change Aadhaar File') : (language === 'hi' ? 'आधार कार्ड चुनें' : 'Upload Aadhaar Card')}</span>
                </label>
                {aadhaarFile && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', marginTop: '6px', fontWeight: 500 }}>
                    ✓ {aadhaarFile.name} ({(aadhaarFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                {aadhaarError && (
                  <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginTop: '6px' }}>
                    {aadhaarError}
                  </div>
                )}
              </div>

              {/* College ID Upload */}
              <div style={{
                border: collegeError ? '2px solid var(--color-danger)' : '1px dashed var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                backgroundColor: 'var(--color-bg-surface-alt)',
                textAlign: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                  <GraduationCap size={20} style={{ color: collegeFile ? 'var(--color-success)' : 'var(--color-primary)' }} />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>
                    {language === 'hi' ? 'कॉलेज / स्टूडेंट आईडी कार्ड *' : 'College / Student ID Card *'}
                  </span>
                </div>

                {collegePreview && (
                  <div style={{ margin: '12px auto', maxWidth: '240px' }}>
                    <img
                      src={collegePreview}
                      alt="College ID preview"
                      style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                )}

                <input
                  type="file"
                  id="college-upload"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleCollegeChange}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="college-upload"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    backgroundColor: 'var(--color-primary)',
                    color: '#ffffff',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    marginTop: '8px',
                  }}
                >
                  <Upload size={16} />
                  <span>{collegeFile ? (language === 'hi' ? 'फ़ाइल बदलें' : 'Change College ID') : (language === 'hi' ? 'कॉलेज आईडी चुनें' : 'Upload College ID')}</span>
                </label>
                {collegeFile && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', marginTop: '6px', fontWeight: 500 }}>
                    ✓ {collegeFile.name} ({(collegeFile.size / 1024).toFixed(1)} KB)
                  </div>
                )}
                {collegeError && (
                  <div style={{ color: 'var(--color-danger)', fontSize: 'var(--font-size-xs)', marginTop: '6px' }}>
                    {collegeError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Review & Confirm */}
          {currentStep === 5 && (
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: '16px' }}>
                5. {language === 'hi' ? 'विवरण की समीक्षा करें' : 'Review & Confirm Details'}
              </h2>

              <div className="review-grid-2" style={{
                backgroundColor: 'var(--color-bg-surface-alt)',
                borderRadius: 'var(--radius-lg)',
                padding: '16px',
                fontSize: 'var(--font-size-sm)',
                marginBottom: '20px',
              }}>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Tenant Name</span>
                  <div style={{ fontWeight: 600 }}>{watchedValues.full_name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Phone</span>
                  <div>{watchedValues.phone}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Gender & DOB</span>
                  <div>{watchedValues.gender?.toUpperCase()} • {watchedValues.date_of_birth}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Emergency Contact</span>
                  <div>{watchedValues.emergency_contact_name} ({watchedValues.emergency_contact_phone})</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>College / Institute</span>
                  <div>{watchedValues.college_name}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Aadhaar Number</span>
                  <div>{watchedValues.id_proof_number}</div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Assigned Room & Bed</span>
                  <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                    {selectedRoom ? `Room ${selectedRoom.room_number}` : 'Unassigned'}
                    {selectedBedId ? ` (Bed ${availableBeds.find(b => b.id === selectedBedId)?.bed_number || selectedBedId})` : ''}
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>Move-In Date</span>
                  <div>{watchedValues.move_in_date}</div>
                </div>
              </div>

              {/* Uploaded Documents Check */}
              <div style={{
                backgroundColor: 'var(--color-primary-light)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: 'var(--font-size-xs)',
              }}>
                <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: '4px' }}>
                  ✓ Documents Attached for Admin Review:
                </div>
                <div>• Aadhaar Card: <strong>{aadhaarFile?.name}</strong></div>
                <div>• College ID: <strong>{collegeFile?.name}</strong></div>
              </div>
            </div>
          )}

          {/* Stepper Buttons */}
          <div className="modal-footer-responsive" style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
            <Button
              variant="outline"
              type="button"
              disabled={currentStep === 1}
              onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 1))}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={16} /> {language === 'hi' ? 'पीछे' : 'Back'}
            </Button>

            {currentStep < 5 ? (
              <Button
                type="button"
                onClick={handleNextStep}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {language === 'hi' ? 'आगे बढ़ें' : 'Next Step'} <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                type="submit"
                isLoading={isSubmitting}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={16} />
                {language === 'hi' ? 'प्रोफाइल पूर्ण करें और सबमिट करें' : 'Complete Profile & Submit'}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

export default TenantOnboarding;
