import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface SettingsResponse {
  settings: {
    cal_link: string | null;
    openai_api_key: string | null;
    admin_email: string | null;
  };
}

interface SettingsForm {
  cal_link: string;
  openai_api_key: string;
  admin_email: string;
}

export function SettingsPage() {
  const { user } = useAuth();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Integration settings state
  const [settingsForm, setSettingsForm] = useState<SettingsForm>({
    cal_link: '',
    openai_api_key: '',
    admin_email: '',
  });
  const [originalSettings, setOriginalSettings] = useState<SettingsForm>({
    cal_link: '',
    openai_api_key: '',
    admin_email: '',
  });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.get<SettingsResponse>('/admin/settings');
        const loaded: SettingsForm = {
          cal_link: data.settings.cal_link || '',
          openai_api_key: data.settings.openai_api_key || '',
          admin_email: data.settings.admin_email || '',
        };
        setSettingsForm(loaded);
        setOriginalSettings(loaded);
      } catch (err) {
        if (err instanceof ApiError) {
          setSettingsError(err.message);
        } else {
          setSettingsError('Failed to load settings');
        }
      } finally {
        setIsLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSettingsSuccess(false);
    setIsSavingSettings(true);

    // Build object with only changed values
    const changedSettings: Partial<SettingsForm> = {};
    if (settingsForm.cal_link !== originalSettings.cal_link) {
      changedSettings.cal_link = settingsForm.cal_link;
    }
    if (settingsForm.openai_api_key !== originalSettings.openai_api_key) {
      changedSettings.openai_api_key = settingsForm.openai_api_key;
    }
    if (settingsForm.admin_email !== originalSettings.admin_email) {
      changedSettings.admin_email = settingsForm.admin_email;
    }

    if (Object.keys(changedSettings).length === 0) {
      setSettingsError('No changes to save');
      setIsSavingSettings(false);
      return;
    }

    try {
      await api.patch('/admin/settings', changedSettings);
      setSettingsSuccess(true);
      setOriginalSettings({ ...originalSettings, ...changedSettings });
    } catch (err) {
      if (err instanceof ApiError) {
        setSettingsError(err.message);
      } else {
        setSettingsError('Failed to save settings');
      }
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 12) {
      setPasswordError('Password must be at least 12 characters');
      return;
    }

    setIsChangingPassword(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        setPasswordError(err.message);
      } else {
        setPasswordError('Failed to change password');
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-dark-400 mt-1">Manage your account settings</p>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Account Information</h2>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-dark-800 flex items-center justify-center">
              <span className="text-2xl font-medium">
                {user?.email?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div>
              <p className="font-medium">{user?.email}</p>
              <p className="text-sm text-dark-500">Administrator</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Settings */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Integration Settings</h2>
        </CardHeader>
        <CardContent>
          {isLoadingSettings ? (
            <div className="text-dark-400">Loading settings...</div>
          ) : (
            <form onSubmit={handleSaveSettings} className="space-y-4 max-w-md">
              {settingsError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  {settingsError}
                </div>
              )}
              {settingsSuccess && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
                  Settings saved successfully
                </div>
              )}

              <Input
                label="Cal.com Booking Link"
                type="text"
                value={settingsForm.cal_link}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, cal_link: e.target.value })
                }
                placeholder="octatech/discovery"
                hint="The Cal.com link for booking consultations (e.g., octatech/discovery)"
              />

              <Input
                label="OpenAI API Key"
                type="password"
                value={settingsForm.openai_api_key}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, openai_api_key: e.target.value })
                }
                placeholder="sk-..."
                hint="Your OpenAI API key for AI lead parsing features"
              />

              <Input
                label="Admin Email"
                type="email"
                value={settingsForm.admin_email}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, admin_email: e.target.value })
                }
                hint="Email address for admin notifications"
              />

              <Button type="submit" isLoading={isSavingSettings}>
                Save Settings
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Change Password</h2>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {passwordError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
                Password changed successfully
              </div>
            )}

            <Input
              label="Current Password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
              }
              required
            />

            <Input
              label="New Password"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, newPassword: e.target.value })
              }
              hint="Must be at least 12 characters with uppercase, lowercase, number, and special character"
              required
            />

            <Input
              label="Confirm New Password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
              }
              required
            />

            <Button type="submit" isLoading={isChangingPassword}>
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security Info */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold">Security</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ShieldIcon className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="font-medium">Session Security</p>
                <p className="text-sm text-dark-500">
                  Your session is protected with HTTP-only cookies and automatic expiration.
                  Sessions are invalidated after 24 hours of inactivity, or 30 days if "Remember me" is enabled.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <LockIcon className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <p className="font-medium">Password Requirements</p>
                <p className="text-sm text-dark-500">
                  Passwords must be at least 12 characters and include uppercase, lowercase, numbers, and special characters.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/30">
        <CardHeader>
          <h2 className="font-semibold text-red-400">Danger Zone</h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dark-400 mb-4">
            These actions are irreversible. Please proceed with caution.
          </p>
          <div className="flex gap-3">
            <Button variant="danger" disabled>
              Delete All Leads
            </Button>
            <Button variant="danger" disabled>
              Reset Account
            </Button>
          </div>
          <p className="text-xs text-dark-500 mt-2">
            Contact support to perform destructive operations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// Icons
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
