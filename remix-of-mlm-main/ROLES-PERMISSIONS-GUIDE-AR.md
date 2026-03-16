# 🔐 دليل نظام الصلاحيات المتقدم

## نظام صلاحيات متعدد المستويات مع لوحات منفصلة

**التاريخ**: 12 مارس 2026  
**الحالة**: ✅ جاهز للتطبيق

---

## 🎯 المشاكل المحلولة

### قبل الحل ❌
- ❌ الفاحص الأمني متاح للجميع بدون تسجيل
- ❌ لا يوجد فصل بين الأدوار
- ❌ MLM و Scanner منفصلين
- ❌ لا يوجد نظام Call Center
- ❌ الادمن لا يرى كل الأنشطة

### بعد الحل ✅
- ✅ الفاحص يتطلب تسجيل للعملاء
- ✅ 4 أدوار منفصلة مع لوحات مخصصة
- ✅ Scanner مدمج في لوحة MLM
- ✅ نظام Call Center كامل
- ✅ الادمن يرى كل شيء مع تنبيهات

---

## 👥 الأدوار (Roles)

### 1. Super Admin (الادمن الرئيسي) 🔑

**الصلاحيات**:
- ✅ رؤية كل شيء في النظام
- ✅ إنشاء وإدارة Call Center
- ✅ إدارة MLM Partners
- ✅ إدارة جميع العملاء
- ✅ رؤية جميع الفحوصات
- ✅ تلقي تنبيهات لكل الأنشطة
- ✅ الوصول لجميع اللوحات

**اللوحة**: `/admin/dashboard`

**الميزات**:
- Dashboard شامل
- إدارة Call Centers
- إدارة MLM Partners
- إدارة العملاء
- تنبيهات فورية
- تقارير شاملة

---

### 2. Call Center (كول سنتر) 📞

**الصلاحيات**:
- ✅ إضافة عملاء جدد
- ✅ تعديل بيانات عملائهم
- ✅ رؤية فحوصات عملائهم
- ✅ تشغيل فحوصات لعملائهم
- ✅ رؤية تقارير عملائهم
- ❌ لا يرى عملاء Call Centers أخرى
- ❌ لا يرى MLM Partners

**اللوحة**: `/call-center/dashboard` (صفحة منفصلة)

**تسجيل الدخول**:
- Username و Password خاص
- يتم إنشاؤه من قبل Super Admin
- لا يحتاج تسجيل عادي

**الميزات**:
- إدارة العملاء
- تشغيل الفحوصات
- رؤية النتائج
- إحصائيات خاصة
- تقارير العملاء

---

### 3. MLM Partner (شريك MLM) 🤝

**الصلاحيات**:
- ✅ الوصول للوحة توماس (MLM Dashboard)
- ✅ **الفاحص الأمني مدمج في اللوحة**
- ✅ إدارة الشبكة (Network)
- ✅ رؤية العمولات
- ✅ إضافة شركاء جدد
- ✅ فحص مواقع غير محدود
- ❌ لا يرى عملاء Call Center

**اللوحة**: `/mlm/dashboard` (لوحة توماس)

**التسجيل**:
- تسجيل عادي مع كود ترويجي
- يحتاج موافقة
- يصبح Partner بعد الموافقة

**الميزات**:
- لوحة MLM كاملة
- **Scanner مدمج**
- إدارة الشبكة
- العمولات
- التقارير

---

### 4. Customer (عميل عادي) 👤

**الصلاحيات**:
- ✅ الوصول للفاحص **بعد التسجيل فقط**
- ✅ فحص موقعه الخاص
- ✅ رؤية نتائج فحوصاته
- ✅ تحميل التقارير
- ❌ لا يرى MLM
- ❌ لا يرى عملاء آخرين

**اللوحة**: `/dashboard`

**التسجيل**:
- **إلزامي** للوصول للفاحص
- تسجيل عادي
- تفعيل الحساب

**الميزات**:
- فحص الموقع
- رؤية النتائج
- تحميل التقارير
- إدارة الحساب

---

## 🔐 التحكم في الوصول للفاحص

### قواعد الوصول

```sql
-- العميل العادي
IF role = 'customer' AND status != 'active' THEN
    RETURN 'يجب التسجيل أولاً';
END IF;

-- MLM Partner
IF role = 'mlm_partner' THEN
    RETURN 'وصول كامل - مدمج في لوحة MLM';
END IF;

-- Call Center
IF role = 'call_center' THEN
    RETURN 'وصول كامل - لعملائهم فقط';
END IF;

-- Super Admin
IF role = 'super_admin' THEN
    RETURN 'وصول كامل - لكل شيء';
END IF;
```

---

## 📊 نظام التنبيهات للادمن

### أنواع التنبيهات

#### 1. Scan Completed (فحص مكتمل)
```typescript
{
  type: 'scan_completed',
  title: 'Scan completed by Call Center: ABC',
  message: 'Customer: John Doe, Domain: example.com, Issues: 5',
  severity: 'warning', // if issues > 10
  source: 'call_center' | 'mlm_partner' | 'customer'
}
```

#### 2. New Customer (عميل جديد)
```typescript
{
  type: 'new_customer',
  title: 'New customer added by Call Center: ABC',
  message: 'Customer: John Doe, Email: john@example.com',
  severity: 'info',
  source: 'call_center'
}
```

#### 3. MLM Registration (تسجيل MLM)
```typescript
{
  type: 'mlm_registration',
  title: 'New MLM Partner registered: John Doe',
  message: 'Email: john@example.com, Sponsor: Jane Smith',
  severity: 'info',
  source: 'mlm_partner'
}
```

#### 4. Call Center Activity (نشاط كول سنتر)
```typescript
{
  type: 'call_center_activity',
  title: 'Call Center ABC: High activity',
  message: '50 scans in last hour',
  severity: 'info',
  source: 'call_center'
}
```

---

## 🚀 التطبيق

### الخطوة 1: تطبيق Schema

```sql
-- في Supabase SQL Editor
\i solutions/08-advanced-roles-permissions.sql

-- التحقق
SELECT * FROM call_center_accounts;
SELECT * FROM admin_notifications;
SELECT * FROM scan_access_control;
```

---

### الخطوة 2: نشر Edge Function

```powershell
# نشر دالة إدارة Call Center
supabase functions deploy manage-call-center
```

---

### الخطوة 3: إنشاء Call Center (من Super Admin)

```typescript
// في Admin Dashboard
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/manage-call-center`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create',
      accountName: 'Call Center ABC',
      username: 'callcenter_abc',
      password: 'secure-password',
      maxCustomers: 1000,
      permissions: {
        can_add_customers: true,
        can_edit_customers: true,
        can_view_scans: true,
        can_run_scans: true,
        can_view_reports: true,
      },
    }),
  }
);
```

---

### الخطوة 4: تحديث Frontend Routes

```typescript
// src/App.tsx أو router config

// Super Admin Routes
{
  path: '/admin',
  element: <AdminLayout />,
  children: [
    { path: 'dashboard', element: <AdminDashboard /> },
    { path: 'call-centers', element: <CallCenterManagement /> },
    { path: 'mlm-partners', element: <MLMPartnerManagement /> },
    { path: 'customers', element: <CustomerManagement /> },
    { path: 'notifications', element: <AdminNotifications /> },
  ],
}

// Call Center Routes (صفحة منفصلة)
{
  path: '/call-center',
  element: <CallCenterLayout />,
  children: [
    { path: 'dashboard', element: <CallCenterDashboard /> },
    { path: 'customers', element: <CallCenterCustomers /> },
    { path: 'scans', element: <CallCenterScans /> },
    { path: 'reports', element: <CallCenterReports /> },
  ],
}

// MLM Partner Routes (لوحة توماس)
{
  path: '/mlm',
  element: <MLMLayout />,
  children: [
    { path: 'dashboard', element: <MLMDashboard /> },
    { path: 'scanner', element: <IntegratedScanner /> }, // مدمج
    { path: 'network', element: <MLMNetwork /> },
    { path: 'commissions', element: <MLMCommissions /> },
  ],
}

// Customer Routes
{
  path: '/dashboard',
  element: <CustomerDashboard />,
}
{
  path: '/scanner',
  element: <ProtectedScanner />, // يتطلب تسجيل
}
```

---

### الخطوة 5: حماية الفاحص

```typescript
// src/components/Scanner/ProtectedScanner.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';

export function ProtectedScanner() {
  const [canScan, setCanScan] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkScanAccess();
  }, []);

  async function checkScanAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      navigate('/register?redirect=/scanner');
      return;
    }

    // Check if user can scan
    const { data, error } = await supabase
      .rpc('can_user_scan', { p_user_id: user.id });

    if (error || !data?.[0]?.can_scan) {
      if (data?.[0]?.requires_registration) {
        navigate('/register?redirect=/scanner');
      } else {
        alert(data?.[0]?.reason || 'لا يمكنك الوصول للفاحص');
        navigate('/dashboard');
      }
      return;
    }

    setCanScan(true);
    setLoading(false);
  }

  if (loading) {
    return <div>جاري التحقق من الصلاحيات...</div>;
  }

  if (!canScan) {
    return null;
  }

  return <Scanner />;
}
```

---

### الخطوة 6: دمج Scanner في MLM Dashboard

```typescript
// src/pages/MLM/MLMDashboard.tsx

export function MLMDashboard() {
  const [showScanner, setShowScanner] = useState(false);

  return (
    <div className="mlm-dashboard">
      <h1>لوحة التحكم - MLM Partner</h1>
      
      {/* MLM Stats */}
      <div className="stats-grid">
        <StatCard title="الشبكة" value="25" />
        <StatCard title="العمولات" value="€1,250" />
        <StatCard title="الفحوصات" value="15" />
      </div>

      {/* Integrated Scanner */}
      <div className="scanner-section">
        <h2>الفاحص الأمني</h2>
        <button onClick={() => setShowScanner(!showScanner)}>
          {showScanner ? 'إخفاء الفاحص' : 'عرض الفاحص'}
        </button>
        
        {showScanner && (
          <div className="integrated-scanner">
            <Scanner 
              onScanComplete={(result) => {
                // Scan completed - admin will be notified automatically
                console.log('Scan completed:', result);
              }}
            />
          </div>
        )}
      </div>

      {/* MLM Network */}
      <div className="network-section">
        <h2>شبكتك</h2>
        <MLMNetwork />
      </div>
    </div>
  );
}
```

---

### الخطوة 7: Admin Notifications

```typescript
// src/components/Admin/AdminNotifications.tsx

export function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(true);

  useEffect(() => {
    loadNotifications();
    
    // Real-time subscription
    const subscription = supabase
      .channel('admin_notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'admin_notifications',
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
        
        // Show toast notification
        if (payload.new.severity === 'critical') {
          showCriticalAlert(payload.new);
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [unreadOnly]);

  async function loadNotifications() {
    const { data } = await supabase
      .rpc('get_admin_notifications', {
        p_limit: 50,
        p_unread_only: unreadOnly,
      });

    setNotifications(data || []);
  }

  async function markAsRead(notificationId: string) {
    await supabase.rpc('mark_notification_read', {
      p_notification_id: notificationId,
    });
    
    loadNotifications();
  }

  return (
    <div className="admin-notifications">
      <div className="header">
        <h2>التنبيهات</h2>
        <label>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          غير المقروءة فقط
        </label>
      </div>

      <div className="notifications-list">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`notification ${notif.severity} ${notif.is_read ? 'read' : 'unread'}`}
          >
            <div className="notification-header">
              <span className="source">{notif.source_name}</span>
              <span className="time">{formatTime(notif.created_at)}</span>
            </div>
            <h3>{notif.title}</h3>
            <p>{notif.message}</p>
            {!notif.is_read && (
              <button onClick={() => markAsRead(notif.id)}>
                تعليم كمقروء
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 📊 Dashboard Examples

### Super Admin Dashboard

```typescript
// عرض إحصائيات شاملة
const { data: stats } = await supabase
  .from('admin_dashboard')
  .select('*');

// stats = [
//   { metric: 'total_customers', value: '150', period: 'all time' },
//   { metric: 'total_mlm_partners', value: '25', period: 'all time' },
//   { metric: 'total_call_centers', value: '5', period: 'all time' },
//   { metric: 'total_scans_today', value: '45', period: 'today' },
//   { metric: 'unread_notifications', value: '12', period: 'current' },
//   { metric: 'critical_notifications', value: '2', period: 'current' },
// ]
```

### Call Center Dashboard

```typescript
// عرض إحصائيات Call Center
const { data: stats } = await supabase
  .rpc('get_call_center_stats', {
    p_call_center_id: callCenterId,
  });

// stats = {
//   total_customers: 50,
//   active_customers: 45,
//   total_scans: 120,
//   scans_today: 15,
//   scans_this_week: 75,
//   scans_this_month: 300,
//   avg_vulnerabilities_per_scan: 3.5,
//   customers_with_issues: 20,
// }
```

---

## ✅ قائمة التحقق

### الإعداد
- [ ] تطبيق SQL schema
- [ ] نشر Edge Function
- [ ] تحديث Frontend routes
- [ ] حماية Scanner component
- [ ] دمج Scanner في MLM dashboard
- [ ] إضافة Admin notifications

### الاختبار
- [ ] إنشاء Call Center من Admin
- [ ] تسجيل دخول Call Center
- [ ] إضافة عميل من Call Center
- [ ] تشغيل فحص من Call Center
- [ ] التحقق من وصول التنبيه للادمن
- [ ] تسجيل MLM Partner
- [ ] اختبار Scanner في MLM dashboard
- [ ] محاولة الوصول للفاحص بدون تسجيل (يجب أن يفشل)

---

## 🎉 النتيجة النهائية

### ما تم إنجازه ✅

✅ **4 أدوار منفصلة** مع صلاحيات محددة  
✅ **Scanner محمي** - يتطلب تسجيل للعملاء  
✅ **Scanner مدمج** في لوحة MLM  
✅ **Call Center system** كامل مع صفحة منفصلة  
✅ **Admin notifications** لكل الأنشطة  
✅ **RLS policies** لحماية البيانات  
✅ **Real-time updates** للتنبيهات

---

**تم إنشاء هذا الدليل بواسطة**: Kiro AI  
**التاريخ**: 12 مارس 2026  
**الحالة**: ✅ جاهز للتطبيق
