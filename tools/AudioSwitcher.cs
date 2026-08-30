using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace OsuSetupAudio
{
    public enum EDataFlow
    {
        eRender = 0,
        eCapture = 1,
        eAll = 2
    }

    public enum ERole
    {
        eConsole = 0,
        eMultimedia = 1,
        eCommunications = 2
    }

    [Flags]
    public enum DeviceState : uint
    {
        Active = 0x00000001,
        Disabled = 0x00000002,
        NotPresent = 0x00000004,
        Unplugged = 0x00000008,
        All = 0x0000000F
    }

    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    internal class MMDeviceEnumeratorComObject { }

    [ComImport]
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceEnumerator
    {
        [PreserveSig]
        int EnumAudioEndpoints(
            EDataFlow dataFlow,
            uint dwStateMask,
            [MarshalAs(UnmanagedType.Interface)] out IMMDeviceCollection ppDevices);

        [PreserveSig]
        int GetDefaultAudioEndpoint(
            EDataFlow dataFlow,
            ERole role,
            [MarshalAs(UnmanagedType.Interface)] out IMMDevice ppEndpoint);

        [PreserveSig]
        int GetDevice(
            [MarshalAs(UnmanagedType.LPWStr)] string pwstrId,
            [MarshalAs(UnmanagedType.Interface)] out IMMDevice ppDevice);

        [PreserveSig]
        int RegisterEndpointNotificationCallback(IntPtr pClient);

        [PreserveSig]
        int UnregisterEndpointNotificationCallback(IntPtr pClient);
    }

    [ComImport]
    [Guid("0BD7A1BE-7A1A-44DB-8397-C0A53CAD458F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDeviceCollection
    {
        [PreserveSig]
        int GetCount(out uint pcDevices);

        [PreserveSig]
        int Item(uint nDevice, [MarshalAs(UnmanagedType.Interface)] out IMMDevice ppDevice);
    }

    [ComImport]
    [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);

        [PreserveSig]
        int OpenPropertyStore(uint stgmAccess, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore ppProperties);

        [PreserveSig]
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);

        [PreserveSig]
        int GetState(out DeviceState pdwState);
    }

    [ComImport]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPropertyStore
    {
        [PreserveSig]
        int GetCount(out uint cProps);

        [PreserveSig]
        int GetAt(uint iProp, out PROPERTYKEY pkey);

        [PreserveSig]
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);

        [PreserveSig]
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT propvar);

        [PreserveSig]
        int Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROPERTYKEY
    {
        public Guid fmtid;
        public uint pid;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROPVARIANT
    {
        public ushort vt;
        public ushort wReserved1;
        public ushort wReserved2;
        public ushort wReserved3;
        public IntPtr p;
        public int p2;
    }

    [ComImport]
    [Guid("F8679F50-850A-41CF-9C72-430F290290C8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr ppFormat);
        [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bDefault, IntPtr ppFormat);
        [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName);
        [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pEndpointFormat, IntPtr pMixFormat);
        [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bDefault, IntPtr pmftDefaultPeriod, IntPtr pmftMinimumPeriod);
        [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pmftPeriod);
        [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr pMode);
        [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, IntPtr mode);
        [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, ref PROPERTYKEY key, IntPtr pv);
        [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, ref PROPERTYKEY key, ref PROPVARIANT pv);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, ERole role);
        [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string pszDeviceName, int bVisible);
    }

    [ComImport]
    [Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    internal class PolicyConfigClient { }

    public class DeviceInfo
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public bool IsDefault { get; set; }
    }

    public class AudioSwitcher
    {
        private static PROPERTYKEY PKEY_Device_FriendlyName = new PROPERTYKEY()
        {
            fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),
            pid = 14
        };

        [DllImport("Ole32.dll")]
        private static extern int PropVariantClear(ref PROPVARIANT pvar);

        private static void ThrowIfFailed(int hr, string operation)
        {
            if (hr < 0)
            {
                Exception ex = Marshal.GetExceptionForHR(hr);
                throw new InvalidOperationException(operation + " failed. HRESULT=0x" + hr.ToString("X8") + " " + (ex != null ? ex.Message : ""));
            }
        }

        private static string GetDeviceId(IMMDevice device)
        {
            if (device == null) return "";
            string id;
            int hr = device.GetId(out id);
            if (hr < 0 || String.IsNullOrWhiteSpace(id)) return "";
            return id;
        }

        private static string GetDeviceName(IMMDevice device)
        {
            if (device == null) return "";
            IPropertyStore store = null;
            PROPVARIANT value = new PROPVARIANT();
            try
            {
                int hr = device.OpenPropertyStore(0, out store);
                if (hr < 0 || store == null) return "";

                hr = store.GetValue(ref PKEY_Device_FriendlyName, out value);
                if (hr < 0 || value.p == IntPtr.Zero) return "";

                string name = Marshal.PtrToStringUni(value.p);
                return name ?? "";
            }
            finally
            {
                try { PropVariantClear(ref value); } catch { }
                if (store != null) Marshal.ReleaseComObject(store);
            }
        }

        public static List<DeviceInfo> GetRenderDevices()
        {
            var list = new List<DeviceInfo>();
            IMMDeviceEnumerator enumerator = null;
            IMMDeviceCollection collection = null;
            IMMDevice defaultDevice = null;
            string defaultId = "";

            try
            {
                object rawEnumerator = new MMDeviceEnumeratorComObject();
                enumerator = rawEnumerator as IMMDeviceEnumerator;
                if (enumerator == null) throw new InvalidOperationException("MMDeviceEnumerator cast failed.");

                int hrDefault = enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out defaultDevice);
                if (hrDefault >= 0 && defaultDevice != null)
                {
                    defaultId = GetDeviceId(defaultDevice);
                }

                int hr = enumerator.EnumAudioEndpoints(EDataFlow.eRender, (uint)DeviceState.Active, out collection);
                ThrowIfFailed(hr, "EnumAudioEndpoints");
                if (collection == null) throw new InvalidOperationException("IMMDeviceCollection is null after EnumAudioEndpoints.");

                uint count;
                hr = collection.GetCount(out count);
                ThrowIfFailed(hr, "GetCount");

                for (uint i = 0; i < count; i++)
                {
                    IMMDevice device = null;
                    try
                    {
                        hr = collection.Item(i, out device);
                        if (hr < 0 || device == null) continue;

                        string id = GetDeviceId(device);
                        string name = GetDeviceName(device);
                        if (!String.IsNullOrWhiteSpace(name) && !String.IsNullOrWhiteSpace(id))
                        {
                            list.Add(new DeviceInfo()
                            {
                                Id = id,
                                Name = name,
                                IsDefault = String.Equals(id, defaultId, StringComparison.OrdinalIgnoreCase)
                            });
                        }
                    }
                    finally
                    {
                        if (device != null) Marshal.ReleaseComObject(device);
                    }
                }

                return list;
            }
            finally
            {
                if (defaultDevice != null) Marshal.ReleaseComObject(defaultDevice);
                if (collection != null) Marshal.ReleaseComObject(collection);
                if (enumerator != null) Marshal.ReleaseComObject(enumerator);
            }
        }

        public static void SetDefaultRenderDevice(string id)
        {
            if (String.IsNullOrWhiteSpace(id)) throw new ArgumentException("Device id is empty.");
            IPolicyConfig policy = null;
            try
            {
                object rawPolicy = new PolicyConfigClient();
                policy = rawPolicy as IPolicyConfig;
                if (policy == null) throw new InvalidOperationException("PolicyConfigClient cast failed.");

                ERole[] roles = new ERole[] { ERole.eConsole, ERole.eMultimedia, ERole.eCommunications };
                foreach (ERole role in roles)
                {
                    int hr = policy.SetDefaultEndpoint(id, role);
                    ThrowIfFailed(hr, "SetDefaultEndpoint " + role.ToString());
                }
            }
            finally
            {
                if (policy != null) Marshal.ReleaseComObject(policy);
            }
        }
    }
}
