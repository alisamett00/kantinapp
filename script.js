// Firebase SDK Bağlantısı & Yerel Hafıza (LocalStorage) Altyapısı
const STORAGE_KEY = 'kantin_takip_ogrenciler_v1';

const firebaseConfig = {
    apiKey: "AIzaSyAzzAxo4yZ99knIGkp7q5LuvdiESMRzucA",
    authDomain: "kantinn.firebaseapp.com",
    databaseURL: "https://kantinn-default-rtdb.firebaseio.com",
    projectId: "kantinn",
    storageBucket: "kantinn.firebasestorage.app",
    messagingSenderId: "589478197779",
    appId: "1:589478197779:web:878fd7c162885626d79de6",
    measurementId: "G-3LJY5TMX0W"
};

let app = null;
let db = null;
let collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query;
let rtdb = null;
let rtdbRef, rtdbOnValue, rtdbSet, rtdbGet;

try {
    const fbApp = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js");
    app = fbApp.initializeApp(firebaseConfig);
} catch (e) {
    console.warn("Firebase App başlatılamadı. Telefon hafızası (localStorage) aktif:", e);
}

try {
    if (app) {
        const fbFirestore = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        db = fbFirestore.getFirestore(app);
        collection = fbFirestore.collection;
        addDoc = fbFirestore.addDoc;
        updateDoc = fbFirestore.updateDoc;
        deleteDoc = fbFirestore.deleteDoc;
        doc = fbFirestore.doc;
        onSnapshot = fbFirestore.onSnapshot;
        query = fbFirestore.query;
    }
} catch (e) {
    console.warn("Firebase Firestore bağlantısı yüklenemedi. Telefon hafızası (localStorage) aktif:", e);
}

try {
    if (app) {
        const fbDatabase = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js");
        rtdb = fbDatabase.getDatabase(app);
        rtdbRef = fbDatabase.ref;
        rtdbOnValue = fbDatabase.onValue;
        rtdbSet = fbDatabase.set;
        rtdbGet = fbDatabase.get;
    }
} catch (e) {
    console.warn("Firebase Realtime Database bağlantısı yüklenemedi:", e);
}

// ============================================================
// ADMIN OTURUM VE YETKİ KONTROL ALTYAPISI
// ============================================================
const ADMIN_PASSWORD = 'celik145346';
const ADMIN_SESSION_KEY = 'kantin_admin_oturum_v1';

/**
 * Mevcut kullanıcının yönetici yetkisine sahip olup olmadığını döner.
 */
function isAdmin() {
    try {
        return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch (e) {
        return false;
    }
}
window.isAdmin = isAdmin;

class StudentManager {
    constructor() {
        // 1. Önce telefonun yerel hafızasından (localStorage) kayıtları anında yükle
        this.students = this.loadFromStorage();
        this.currentFilter = 'all';
        this.currentSort = 'name-asc'; // Varsayılan: A'dan Z'ye alfabetik sıralama
        this.currentLetter = 'all';    // Varsayılan: Tüm baş harfler
        this.searchQuery = '';
        this.editingId = null;
        this.studentToDelete = null;
        this.studentToPay = null;
        this.paidPaymentMap = {};
        this.deferredInstallPrompt = null;

        this.initDOM();
        this.initAlphabetChips();
        this.bindEvents();
        this.setupPWA();
        this.listenNetworkStatus();

        // 2. Yüklenen verileri ekranda anında göster (hiç bekleme olmadan açılış)
        this.render();

        // 3. Bulut senkronizasyonunu arka planda başlat (varsa)
        if (db && firebaseConfig.projectId !== "PROJE-ID") {
            this.listenData();
        } else {
            console.log("Kayıtlar telefon hafızasında (localStorage) saklanıyor.");
        }
        this.listenPaymentStatuses();
    }

    initDOM() {
        // Elements
        this.studentsList = document.getElementById('studentsList');
        this.addStudentBtn = document.getElementById('addStudentBtn');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        this.installAppBtn = document.getElementById('installAppBtn');
        this.adminActiveBar = document.getElementById('adminActiveBar');

        // Sorting & Alphabet Filter
        this.sortSelect = document.getElementById('sortSelect');
        this.sortByNameBtn = document.getElementById('sortByNameBtn');
        this.sortByEndDateBtn = document.getElementById('sortByEndDateBtn');
        this.alphabetChipsContainer = document.getElementById('alphabetChips');
        this.clearLetterBtn = document.getElementById('clearLetterBtn');
        this.activeLetterText = document.getElementById('activeLetterText');

        // Modals
        this.studentModal = document.getElementById('studentModal');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.studentForm = document.getElementById('studentForm');
        this.modalTitle = document.getElementById('modalTitle');

        // Delete Confirm Modal
        this.confirmModal = document.getElementById('confirmModal');
        this.confirmCancelBtn = document.getElementById('confirmCancelBtn');
        this.confirmOkBtn = document.getElementById('confirmOkBtn');
        this.confirmMessage = document.getElementById('confirmMessage');

        // Payment Confirm Modal
        this.paymentConfirmModal = document.getElementById('paymentConfirmModal');
        this.paymentConfirmCancelBtn = document.getElementById('paymentConfirmCancelBtn');
        this.paymentConfirmOkBtn = document.getElementById('paymentConfirmOkBtn');
        this.paymentConfirmMessage = document.getElementById('paymentConfirmMessage');

        // Universal Install Modal
        this.installAppModal = document.getElementById('installAppModal');
        this.closeInstallModalBtn = document.getElementById('closeInstallModalBtn');
        this.closeInstallDoneBtn = document.getElementById('closeInstallDoneBtn');
        this.directInstallBtn = document.getElementById('directInstallBtn');
        this.androidNativePromptWrapper = document.getElementById('androidNativePromptWrapper');
        this.installTabs = document.querySelectorAll('.install-tab-btn');
        this.platformPanels = document.querySelectorAll('.platform-panel');

        // Search & Filters
        this.searchInput = document.getElementById('searchInput');
        this.clearSearchBtn = document.getElementById('clearSearchBtn');
        this.filterBtns = document.querySelectorAll('.filter-btn');
        this.statCards = document.querySelectorAll('.stat-card');

        // Status Counts
        this.totalActiveCount = document.getElementById('totalActiveCount');
        this.totalExpiringCount = document.getElementById('totalExpiringCount');
        this.totalExpiredCount = document.getElementById('totalExpiredCount');
        this.totalPassiveCount = document.getElementById('totalPassiveCount');

        this.filterAllCount = document.getElementById('filterAllCount');
        this.filterActiveCount = document.getElementById('filterActiveCount');
        this.filterExpiringCount = document.getElementById('filterExpiringCount');
        this.filterExpiredCount = document.getElementById('filterExpiredCount');
        this.filterPassiveCount = document.getElementById('filterPassiveCount');

        this.connectionStatus = document.getElementById('connectionStatus');
        this.toastContainer = document.getElementById('toastContainer');

        // Form Inputs
        this.inputs = {
            id: document.getElementById('studentId'),
            fullName: document.getElementById('fullName'),
            studentNumber: document.getElementById('studentNumber'),
            phoneNumber: document.getElementById('phoneNumber'),
            registrationDate: document.getElementById('registrationDate'),
            subscriptionEndDate: document.getElementById('subscriptionEndDate'),
            status: document.getElementById('status')
        };
    }

    bindEvents() {
        // Open/Close student modal
        this.addStudentBtn.addEventListener('click', () => {
            this.triggerHaptic();
            this.openModal();
        });
        this.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.cancelBtn.addEventListener('click', () => this.closeModal());
        this.studentModal.addEventListener('click', (e) => {
            if (e.target === this.studentModal) this.closeModal();
        });

        // Form submit
        this.studentForm.addEventListener('submit', (e) => this.handleSubmit(e));

        // Quick date increment buttons inside modal
        const quickDateBtns = document.querySelectorAll('.quick-date-btn');
        quickDateBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const days = parseInt(btn.dataset.days, 10);
                this.addDaysToEndDate(days);
                this.triggerHaptic();
            });
        });

        // Search Input
        this.searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase().trim();
            this.clearSearchBtn.style.display = this.searchQuery ? 'flex' : 'none';
            this.render();
        });

        this.clearSearchBtn.addEventListener('click', () => {
            this.searchInput.value = '';
            this.searchQuery = '';
            this.clearSearchBtn.style.display = 'none';
            this.searchInput.focus();
            this.render();
        });

        // Quick Sort: A'dan Z'ye Sırala Butonu
        if (this.sortByNameBtn) {
            this.sortByNameBtn.addEventListener('click', () => {
                this.triggerHaptic();
                this.setSortMode('name-asc');
                this.showToast("A'dan Z'ye alfabetik sıralandı.", 'info');
            });
        }

        // Quick Sort: Abonelik Bitiş Tarihine Göre Sırala Butonu
        if (this.sortByEndDateBtn) {
            this.sortByEndDateBtn.addEventListener('click', () => {
                this.triggerHaptic();
                this.setSortMode('end-date-asc');
                this.showToast("Abonelik bitiş tarihine göre sıralandı (En yakın ilk).", 'info');
            });
        }

        // Sort Selection dropdown change
        if (this.sortSelect) {
            this.sortSelect.addEventListener('change', (e) => {
                this.triggerHaptic();
                this.setSortMode(e.target.value);
            });
        }

        // Clear Letter Filter button
        if (this.clearLetterBtn) {
            this.clearLetterBtn.addEventListener('click', () => {
                this.triggerHaptic();
                this.setLetterFilter('all');
            });
        }

        // Filter Buttons
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.triggerHaptic();
                const targetBtn = e.target.closest('.filter-btn');
                this.setActiveFilter(targetBtn.dataset.filter);
            });
        });

        // Stat Card Clicks (Filter shortcuts)
        this.statCards.forEach(card => {
            card.addEventListener('click', () => {
                this.triggerHaptic();
                const filter = card.dataset.stat;
                this.setActiveFilter(filter);
            });
        });

        // Export to CSV
        this.exportCsvBtn.addEventListener('click', () => {
            this.triggerHaptic();
            this.exportToCSV();
        });

        // Confirm Modal events
        this.confirmCancelBtn.addEventListener('click', () => this.closeConfirmModal());
        this.confirmModal.addEventListener('click', (e) => {
            if (e.target === this.confirmModal) this.closeConfirmModal();
        });
        this.confirmOkBtn.addEventListener('click', () => this.executeDelete());

        // Payment Confirm Modal events
        if (this.paymentConfirmCancelBtn) {
            this.paymentConfirmCancelBtn.addEventListener('click', () => this.closePaymentConfirmModal());
        }
        if (this.paymentConfirmModal) {
            this.paymentConfirmModal.addEventListener('click', (e) => {
                if (e.target === this.paymentConfirmModal) this.closePaymentConfirmModal();
            });
        }
        if (this.paymentConfirmOkBtn) {
            this.paymentConfirmOkBtn.addEventListener('click', () => this.executePaymentConfirm());
        }

        // Universal Install Modal events
        if (this.closeInstallModalBtn) {
            this.closeInstallModalBtn.addEventListener('click', () => this.closeInstallModal());
        }
        if (this.closeInstallDoneBtn) {
            this.closeInstallDoneBtn.addEventListener('click', () => this.closeInstallModal());
        }
        if (this.installAppModal) {
            this.installAppModal.addEventListener('click', (e) => {
                if (e.target === this.installAppModal) this.closeInstallModal();
            });
        }
        if (this.installTabs) {
            this.installTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    this.triggerHaptic();
                    this.switchInstallTab(tab.dataset.platform);
                });
            });
        }
        if (this.directInstallBtn) {
            this.directInstallBtn.addEventListener('click', () => this.triggerNativeInstall());
        }
    }

    triggerHaptic() {
        if ('vibrate' in navigator) {
            navigator.vibrate(20);
        }
    }

    setActiveFilter(filterName) {
        this.currentFilter = filterName;
        this.filterBtns.forEach(b => {
            if (b.dataset.filter === filterName) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        this.render();
    }

    setupPWA() {
        // Register Service Worker
        if ('serviceWorker' in navigator) {
            const registerSW = () => {
                navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' }).then((reg) => {
                    console.log('ServiceWorker kayıt başarılı:', reg.scope);
                }).catch((err) => {
                    console.warn('ServiceWorker kaydı başarısız:', err);
                });
            };

            if (document.readyState === 'complete') {
                registerSW();
            } else {
                window.addEventListener('load', registerSW);
            }
        }

        // Always make install button visible if not running as installed standalone app
        if (!this.isInStandaloneMode()) {
            this.installAppBtn.style.display = 'flex';
        }

        // Android / Chromium native install prompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            this.installAppBtn.style.display = 'flex';
            if (this.androidNativePromptWrapper) {
                this.androidNativePromptWrapper.style.display = 'block';
            }
        });

        // App installed event
        window.addEventListener('appinstalled', () => {
            this.showToast('Kantin Takip başarıyla kuruldu!', 'success');
            this.deferredInstallPrompt = null;
            this.installAppBtn.style.display = 'none';
            this.closeInstallModal();
        });

        // Install button click
        this.installAppBtn.addEventListener('click', () => {
            this.triggerHaptic();
            this.showInstallModal();
        });
    }

    isIOS() {
        const isAppleDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
        return isAppleDevice || isIPadOS;
    }

    isAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    isInStandaloneMode() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || 
               ('standalone' in window.navigator && window.navigator.standalone === true);
    }

    showInstallModal(preferredPlatform = null) {
        if (!this.installAppModal) return;

        let targetPlatform = preferredPlatform;
        if (!targetPlatform) {
            if (this.isIOS()) {
                targetPlatform = 'ios';
            } else if (this.isAndroid()) {
                targetPlatform = 'android';
            } else {
                targetPlatform = 'desktop';
            }
        }

        this.switchInstallTab(targetPlatform);
        this.installAppModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeInstallModal() {
        if (!this.installAppModal) return;
        this.installAppModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    switchInstallTab(platform) {
        if (this.installTabs) {
            this.installTabs.forEach(t => {
                t.classList.toggle('active', t.dataset.platform === platform);
            });
        }
        if (this.platformPanels) {
            this.platformPanels.forEach(p => {
                p.classList.toggle('active', p.id === `panel-${platform}`);
            });
        }
    }

    async triggerNativeInstall() {
        this.triggerHaptic();
        if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            const choiceResult = await this.deferredInstallPrompt.userChoice;
            if (choiceResult.outcome === 'accepted') {
                this.showToast('Uygulama yükleniyor...', 'success');
            }
            this.deferredInstallPrompt = null;
            if (this.androidNativePromptWrapper) {
                this.androidNativePromptWrapper.style.display = 'none';
            }
        } else {
            this.showToast('Tarayıcınızın menüsünden "Uygulamayı Yükle" seçeneğini kullanabilirsiniz.', 'info');
        }
    }

    listenNetworkStatus() {
        const updateStatus = () => {
            const isOnline = navigator.onLine;
            if (this.connectionStatus) {
                this.connectionStatus.innerHTML = `
                    <span class="status-dot ${isOnline ? '' : 'offline'}"></span>
                    ${isOnline ? 'Abonelik Takip (Cihaz Hafızası Aktif)' : 'Çevrimdışı Mod (Cihaz Hafızası Aktif)'}
                `;
            }
            if (!isOnline) {
                this.showToast('Çevrimdışı mod: Kayıtlarınız telefon hafızasında güvende.', 'info');
            } else {
                this.showToast('Yeniden bağlandı.', 'success');
            }
        };

        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        updateStatus();
    }

    // === LocalStorage Altyapısı ===
    loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
        } catch (error) {
            console.error("Yerel hafıza (localStorage) okuma hatası:", error);
        }
        return [];
    }

    saveToStorage() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.students));
            return true;
        } catch (error) {
            console.error("Yerel hafıza (localStorage) yazma hatası:", error);
            this.showToast("Telefon hafızasına kaydedilemedi: Hafıza dolu olabilir.", "error");
            return false;
        }
    }

    async syncLocalToCloud() {
        if (!db || !navigator.onLine || !addDoc || !collection) return;
        try {
            let hasSync = false;
            for (let i = 0; i < this.students.length; i++) {
                const s = this.students[i];
                if (s.id && s.id.toString().startsWith('loc_')) {
                    const { id, ...data } = s;
                    const docRef = await addDoc(collection(db, "students"), data);
                    s.id = docRef.id;
                    hasSync = true;
                }
            }
            if (hasSync) {
                this.saveToStorage();
            }
        } catch (e) {
            console.warn("Bulut senkronizasyonunda geçici hata:", e);
        }
    }

    showToast(message, type = 'info') {
        if (!this.toastContainer) return;

        const iconMap = {
            success: 'ph-check-circle',
            error: 'ph-x-circle',
            warning: 'ph-warning-circle',
            info: 'ph-info'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="ph ${iconMap[type] || 'ph-info'}"></i>
            <span>${message}</span>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    listenData() {
        if (!db || !query || !collection || !onSnapshot) return;
        try {
            const q = query(collection(db, "students"));
            onSnapshot(q, (snapshot) => {
                const remoteStudents = [];
                snapshot.forEach((doc) => {
                    remoteStudents.push({ id: doc.id, ...doc.data() });
                });

                if (remoteStudents.length > 0) {
                    // Buluttaki veriler ile yerel verileri harmanla
                    remoteStudents.forEach(rem => {
                        const localMatch = this.students.find(loc =>
                            loc.id === rem.id || (loc.studentNumber && loc.studentNumber === rem.studentNumber)
                        );
                        const paymentKey = this.getPaymentKey(rem);
                        if ((localMatch && localMatch.odemeDurumu === true) || (paymentKey && this.paidPaymentMap[paymentKey] === true)) {
                            if (rem.odemeDurumu !== true) {
                                rem.odemeDurumu = true;
                                if (db && updateDoc && doc && rem.id && !rem.id.toString().startsWith('loc_')) {
                                    updateDoc(doc(db, "students", rem.id), { odemeDurumu: true }).catch(() => {});
                                }
                            }
                        }
                    });

                    // Henüz buluta iletilmemiş yerel kayıtları ('loc_') koru
                    const localOnly = this.students.filter(local => 
                        local.id && local.id.toString().startsWith('loc_') &&
                        !remoteStudents.some(rem => rem.studentNumber === local.studentNumber)
                    );
                    this.students = [...remoteStudents, ...localOnly];
                    this.saveToStorage();
                    this.render();

                    if (localOnly.length > 0) {
                        this.syncLocalToCloud();
                    }
                } else if (this.students.length > 0) {
                    // Bulut boş ama telefon hafızasında kayıtlar varsa buluta yedekle
                    this.syncLocalToCloud();
                } else {
                    this.render();
                }
            }, (error) => {
                console.warn("Firestore bulut bağlantısı yok veya izin verilmedi. Telefon hafızası (localStorage) devrede:", error);
                // Bulutta hata olsa bile telefon hafızasındaki kayıtlar korunur!
                if (!this.students || this.students.length === 0) {
                    this.students = this.loadFromStorage();
                }
                this.render();
            });
        } catch (err) {
            console.warn("Firestore dinleyici başlatılamadı:", err);
        }
    }

    openModal(student = null) {
        if (student) {
            this.modalTitle.textContent = 'Öğrenci Düzenle';
            this.editingId = student.id;
            this.inputs.id.value = student.id;
            this.inputs.fullName.value = student.fullName || '';
            this.inputs.studentNumber.value = student.studentNumber || '';
            this.inputs.phoneNumber.value = student.phoneNumber || '';
            this.inputs.registrationDate.value = student.registrationDate || '';
            this.inputs.subscriptionEndDate.value = student.subscriptionEndDate || '';
            this.inputs.status.value = student.status || 'active';
        } else {
            this.modalTitle.textContent = 'Yeni Öğrenci Ekle';
            this.editingId = null;
            this.studentForm.reset();

            const today = new Date().toISOString().split('T')[0];
            this.inputs.registrationDate.value = today;

            const nextMonth = new Date();
            nextMonth.setDate(nextMonth.getDate() + 30);
            this.inputs.subscriptionEndDate.value = nextMonth.toISOString().split('T')[0];
        }

        this.studentModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.studentModal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => this.studentForm.reset(), 300);
    }

    addDaysToEndDate(days) {
        const currentEnd = this.inputs.subscriptionEndDate.value ? new Date(this.inputs.subscriptionEndDate.value) : new Date();
        const baseDate = isNaN(currentEnd.getTime()) ? new Date() : currentEnd;
        baseDate.setDate(baseDate.getDate() + days);
        this.inputs.subscriptionEndDate.value = baseDate.toISOString().split('T')[0];
    }

    async handleSubmit(e) {
        e.preventDefault();

        const existingStudent = this.editingId ? this.students.find(s => s.id === this.editingId) : null;
        const studentData = {
            fullName: this.inputs.fullName.value.trim(),
            studentNumber: this.inputs.studentNumber.value.trim(),
            phoneNumber: this.inputs.phoneNumber.value.trim(),
            registrationDate: this.inputs.registrationDate.value,
            subscriptionEndDate: this.inputs.subscriptionEndDate.value,
            status: this.inputs.status.value,
            odemeDurumu: existingStudent ? Boolean(existingStudent.odemeDurumu) : false
        };

        if (!studentData.fullName || !studentData.studentNumber || !studentData.registrationDate || !studentData.subscriptionEndDate) {
            this.showToast('Lütfen zorunlu alanları doldurun.', 'warning');
            return;
        }

        // Numara kontrolü
        if (this.editingId) {
            const duplicate = this.students.some(s => s.studentNumber === studentData.studentNumber && s.id !== this.editingId);
            if (duplicate) {
                this.showToast('Bu öğrenci numarasıyla başka bir kayıt mevcut!', 'warning');
                return;
            }
        } else {
            const exists = this.students.some(s => s.studentNumber === studentData.studentNumber);
            if (exists) {
                this.showToast('Bu öğrenci numarasıyla zaten bir kayıt mevcut!', 'warning');
                return;
            }
        }

        try {
            if (this.editingId) {
                // Standart kullanıcı düzenleme yapamaz
                if (!isAdmin()) {
                    this.showToast('Öğrenci düzenleme yetkisi sadece yöneticilere aittir.', 'warning');
                    return;
                }
                // 1. Yerel hafızada hemen güncelle ve kaydet
                const index = this.students.findIndex(s => s.id === this.editingId);
                if (index !== -1) {
                    this.students[index] = { ...this.students[index], ...studentData };
                }
                this.saveToStorage();
                this.render();
                this.showToast('Öğrenci kaydı güncellendi.', 'success');

                // 2. Arka planda bulutu güncelle (varsa)
                if (db && updateDoc && doc && !this.editingId.toString().startsWith('loc_')) {
                    try {
                        const studentRef = doc(db, "students", this.editingId);
                        await updateDoc(studentRef, studentData);
                    } catch (cloudErr) {
                        console.warn("Bulut güncellenemedi, yerel hafızada korundu:", cloudErr);
                    }
                }
            } else {
                // 1. Yeni kayıt: Yerel hafızaya benzersiz kimlikle hemen ekle ve kaydet
                const localId = 'loc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                const newStudent = { id: localId, ...studentData };

                this.students.unshift(newStudent);
                this.saveToStorage();
                this.render();
                this.showToast('Öğrenci telefon hafızasına kaydedildi.', 'success');

                // 2. Arka planda buluta da kaydetmeyi dene (varsa)
                if (db && addDoc && collection) {
                    try {
                        const docRef = await addDoc(collection(db, "students"), studentData);
                        newStudent.id = docRef.id;
                        this.saveToStorage();
                    } catch (cloudErr) {
                        console.warn("Buluta iletilemedi, ancak telefon hafızasında korundu:", cloudErr);
                    }
                }
            }

            this.triggerHaptic();
            this.closeModal();
        } catch (error) {
            console.error("Kayıt işlemi hatası:", error);
            this.showToast('İşlem sırasında bir hata oluştu.', 'error');
        }
    }

    async toggleStatus(id) {
        if (!isAdmin()) {
            this.showToast('Durum değiştirme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        this.triggerHaptic();
        const student = this.students.find(s => s.id === id);
        if (student) {
            const newStatus = student.status === 'active' ? 'passive' : 'active';
            student.status = newStatus;

            // Yerel hafızaya hemen kaydet ve listeyi güncelle
            this.saveToStorage();
            this.render();
            this.showToast(`Durum "${newStatus === 'active' ? 'Aktif' : 'Pasif'}" yapıldı.`, 'info');

            // Bulutta güncelle (arka planda)
            if (db && updateDoc && doc && !id.toString().startsWith('loc_')) {
                try {
                    const studentRef = doc(db, "students", id);
                    await updateDoc(studentRef, { status: newStatus });
                } catch (error) {
                    console.warn("Bulut durum güncelleme hatası:", error);
                }
            }
        }
    }

    async renewSubscription(id, days = 30) {
        if (!isAdmin()) {
            this.showToast('Abonelik süresi uzatma yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        this.triggerHaptic();
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        const currentEnd = new Date(student.subscriptionEndDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let baseDate = currentEnd > today ? currentEnd : today;
        baseDate.setDate(baseDate.getDate() + days);

        const newEndDateStr = baseDate.toISOString().split('T')[0];

        student.subscriptionEndDate = newEndDateStr;
        student.status = 'active'; // Otomatik aktifleştir

        // Yerel hafızaya hemen kaydet ve listeyi güncelle
        this.saveToStorage();
        this.render();
        this.showToast(`${student.fullName} için +${days} gün uzatıldı!`, 'success');

        // Bulutta güncelle (arka planda)
        if (db && updateDoc && doc && !id.toString().startsWith('loc_')) {
            try {
                const studentRef = doc(db, "students", id);
                await updateDoc(studentRef, {
                    subscriptionEndDate: newEndDateStr,
                    status: 'active'
                });
            } catch (error) {
                console.warn("Bulut abonelik yenileme hatası:", error);
            }
        }
    }

    confirmDelete(id) {
        if (!isAdmin()) {
            this.showToast('Öğrenci silme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        this.triggerHaptic();
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        this.studentToDelete = student;
        this.confirmMessage.innerHTML = `<strong>${student.fullName}</strong> (${student.studentNumber}) isimli öğrenciyi silmek istediğinize emin misiniz?`;
        this.confirmModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeConfirmModal() {
        this.confirmModal.classList.remove('active');
        document.body.style.overflow = '';
        this.studentToDelete = null;
    }

    async executeDelete() {
        if (!isAdmin()) {
            this.showToast('Öğrenci silme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        if (!this.studentToDelete) return;
        this.triggerHaptic();

        const idToDelete = this.studentToDelete.id;
        const studentName = this.studentToDelete.fullName;

        // Yerel hafızadan hemen kaldır ve kaydet
        this.students = this.students.filter(s => s.id !== idToDelete);
        this.saveToStorage();
        this.render();
        this.showToast(`${studentName} kaydı silindi.`, 'success');
        this.closeConfirmModal();

        // Buluttan sil (arka planda)
        if (db && deleteDoc && doc && !idToDelete.toString().startsWith('loc_')) {
            try {
                const studentRef = doc(db, "students", idToDelete);
                await deleteDoc(studentRef);
            } catch (error) {
                console.warn("Bulut silme hatası:", error);
            }
        }
    }

    getPaymentKey(student) {
        if (!student) return '';
        const raw = String(student.studentNumber || student.id || '').trim();
        return raw.replace(/[.#$/\[\]\s]/g, '_');
    }

    applyPaidMap(mapObj) {
        if (!mapObj || typeof mapObj !== 'object') return;
        let changed = false;
        Object.entries(mapObj).forEach(([key, val]) => {
            const isPaid = val === true || (val && typeof val === 'object' && val.odemeDurumu === true);
            if (isPaid) {
                this.paidPaymentMap[key] = true;
            }
        });
        this.students.forEach(s => {
            const k = this.getPaymentKey(s);
            if ((k && this.paidPaymentMap[k] === true) || (s.id && this.paidPaymentMap[s.id] === true)) {
                if (s.odemeDurumu !== true) {
                    s.odemeDurumu = true;
                    changed = true;
                }
            }
        });
        if (changed) {
            this.saveToStorage();
            this.render();
        }
    }

    listenPaymentStatuses() {
        const testAdapter = window.__KANTIN_RTDB_ADAPTER__;
        if (testAdapter && typeof testAdapter.onValue === 'function') {
            testAdapter.onValue('ogrenci_odemeleri', (val) => {
                if (val && typeof val === 'object') {
                    this.applyPaidMap(val);
                }
            });
            return;
        }

        if (rtdb && rtdbRef && rtdbOnValue) {
            try {
                const payRef = rtdbRef(rtdb, 'ogrenci_odemeleri');
                rtdbOnValue(payRef, (snapshot) => {
                    if (snapshot.exists()) {
                        this.applyPaidMap(snapshot.val());
                    }
                }, (err) => {
                    console.warn("Firebase ödeme durumu dinleme uyarısı:", err);
                });
            } catch (e) {
                console.warn("Ödeme durumu dinleyicisi başlatılamadı:", e);
            }
        }

        const base = (firebaseConfig.databaseURL || '').replace(/\/+$/, '');
        if (base && navigator.onLine) {
            fetch(`${base}/ogrenci_odemeleri.json`, { cache: 'no-store' })
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && typeof data === 'object') {
                        this.applyPaidMap(data);
                    }
                })
                .catch(() => {});
        }
    }

    confirmPayment(id) {
        this.triggerHaptic();
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        if (student.odemeDurumu === true) {
            this.showToast(`${student.fullName} için aylık ödeme zaten onaylanmış.`, 'info');
            return;
        }

        this.studentToPay = student;
        if (this.paymentConfirmModal && this.paymentConfirmMessage) {
            this.paymentConfirmMessage.innerHTML = `<strong>${escapeHtml(student.fullName)}</strong> (${escapeHtml(student.studentNumber)}) — Öğrencinin aylık ödeme yaptığını onaylıyor musunuz?`;
            this.paymentConfirmModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            const approved = window.confirm('Öğrencinin aylık ödeme yaptığını onaylıyor musunuz?');
            if (approved) {
                this.executePaymentConfirm();
            } else {
                this.studentToPay = null;
            }
        }
    }

    closePaymentConfirmModal() {
        if (this.paymentConfirmModal) {
            this.paymentConfirmModal.classList.remove('active');
        }
        document.body.style.overflow = '';
        this.studentToPay = null;
    }

    async executePaymentConfirm() {
        if (!this.studentToPay) return;
        this.triggerHaptic();

        const student = this.studentToPay;
        student.odemeDurumu = true;

        const key = this.getPaymentKey(student);
        if (key) this.paidPaymentMap[key] = true;

        // 1. Yerel hafızada hemen güncelle ve arayüzü yenile
        this.saveToStorage();
        this.render();
        this.closePaymentConfirmModal();
        this.showToast(`${student.fullName} için aylık ödeme onaylandı!`, 'success');

        // 2. Firebase veritabanına kalıcı olarak kaydet (Firestore + Realtime Database)
        await this.savePaymentToFirebase(student);
    }

    async savePaymentToFirebase(student) {
        if (!student) return;
        const key = this.getPaymentKey(student);
        const payload = {
            odemeDurumu: true,
            studentId: student.id,
            studentNumber: student.studentNumber,
            fullName: student.fullName
        };

        // Test adaptörü kontrolü
        const testAdapter = window.__KANTIN_RTDB_ADAPTER__;
        if (testAdapter && typeof testAdapter.set === 'function') {
            const current = (typeof testAdapter.getState === 'function' ? testAdapter.getState().ogrenci_odemeleri : null) || {};
            current[key || student.id] = payload;
            await testAdapter.set('ogrenci_odemeleri', current);
        }

        // A) Firestore 'students' koleksiyonundaki öğrenci kaydına odemeDurumu: true yaz
        if (db && updateDoc && doc && student.id && !student.id.toString().startsWith('loc_')) {
            try {
                const studentRef = doc(db, "students", student.id);
                await updateDoc(studentRef, { odemeDurumu: true });
            } catch (err) {
                console.warn("Firestore ödeme durumu güncelleme uyarısı:", err);
            }
        } else if (db && student.id && student.id.toString().startsWith('loc_')) {
            this.syncLocalToCloud();
        }

        // B) Firebase Realtime Database üzerinde de öğrenci ödeme kaydını senkronize et
        if (rtdb && rtdbRef && rtdbSet && key) {
            try {
                const payNodeRef = rtdbRef(rtdb, `ogrenci_odemeleri/${key}`);
                rtdbSet(payNodeRef, payload).catch(() => {});
            } catch (e) {
                console.warn("RTDB ödeme kaydı uyarısı:", e);
            }
        }

        const base = (firebaseConfig.databaseURL || '').replace(/\/+$/, '');
        if (base && key && navigator.onLine) {
            fetch(`${base}/ogrenci_odemeleri/${encodeURIComponent(key)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {});
        }
    }

    editStudent(id) {
        if (!isAdmin()) {
            this.showToast('Öğrenci düzenleme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        this.triggerHaptic();
        const student = this.students.find(s => s.id === id);
        if (student) {
            this.openModal(student);
        }
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('tr-TR', options);
    }

    getRemainingDays(dateString) {
        if (!dateString) return null;
        const endDate = new Date(dateString);
        endDate.setHours(23, 59, 59, 999);
        const today = new Date();
        const diffTime = endDate - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    isSubscriptionExpiringSoon(dateString) {
        const diffDays = this.getRemainingDays(dateString);
        return diffDays !== null && diffDays >= 0 && diffDays <= 3;
    }

    isSubscriptionExpired(dateString) {
        const diffDays = this.getRemainingDays(dateString);
        return diffDays !== null && diffDays < 0;
    }

    updateStats() {
        let active = 0;
        let expiring = 0;
        let expired = 0;
        let passive = 0;

        this.students.forEach(s => {
            if (s.status === 'active') {
                if (this.isSubscriptionExpired(s.subscriptionEndDate)) {
                    expired++;
                } else if (this.isSubscriptionExpiringSoon(s.subscriptionEndDate)) {
                    expiring++;
                    active++;
                } else {
                    active++;
                }
            } else {
                passive++;
            }
        });

        this.totalActiveCount.textContent = active;
        this.totalExpiringCount.textContent = expiring;
        this.totalExpiredCount.textContent = expired;
        this.totalPassiveCount.textContent = passive;

        this.filterAllCount.textContent = this.students.length;
        this.filterActiveCount.textContent = active;
        this.filterExpiringCount.textContent = expiring;
        this.filterExpiredCount.textContent = expired;
        this.filterPassiveCount.textContent = passive;
    }

    setSortMode(sortKey) {
        this.currentSort = sortKey;
        if (this.sortSelect) {
            this.sortSelect.value = sortKey;
        }
        if (this.sortByNameBtn) {
            this.sortByNameBtn.classList.toggle('active', sortKey === 'name-asc');
        }
        if (this.sortByEndDateBtn) {
            this.sortByEndDateBtn.classList.toggle('active', sortKey === 'end-date-asc');
        }
        this.render();
    }

    initAlphabetChips() {
        if (!this.alphabetChipsContainer) return;

        // Turkish alphabet letters
        const letters = [
            'Tümü',
            'A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'I', 'İ',
            'J', 'K', 'L', 'M', 'N', 'O', 'Ö', 'P', 'R', 'S', 'Ş',
            'T', 'U', 'Ü', 'V', 'Y', 'Z'
        ];

        this.alphabetChipsContainer.innerHTML = letters.map(letter => {
            const val = letter === 'Tümü' ? 'all' : letter;
            const isAll = val === 'all';
            return `<button type="button" class="letter-chip ${isAll ? 'active' : ''}" data-letter="${val}">${letter}</button>`;
        }).join('');

        const chips = this.alphabetChipsContainer.querySelectorAll('.letter-chip');
        chips.forEach(chip => {
            chip.addEventListener('click', () => {
                this.triggerHaptic();
                const letter = chip.dataset.letter;
                // If clicked already active letter (other than 'all'), toggle back to 'all'
                if (this.currentLetter === letter && letter !== 'all') {
                    this.setLetterFilter('all');
                } else {
                    this.setLetterFilter(letter);
                }
            });
        });
    }

    setLetterFilter(letter) {
        this.currentLetter = letter;

        if (this.clearLetterBtn && this.activeLetterText) {
            if (letter === 'all') {
                this.clearLetterBtn.style.display = 'none';
            } else {
                this.activeLetterText.textContent = `${letter}`;
                this.clearLetterBtn.style.display = 'inline-flex';
            }
        }

        this.updateAlphabetChips();
        this.render();
    }

    updateAlphabetChips() {
        if (!this.alphabetChipsContainer) return;

        // Check which letters currently have students in the database
        const existingLetters = new Set();
        this.students.forEach(s => {
            const firstChar = (s.fullName || '').trim().charAt(0).toLocaleUpperCase('tr');
            if (firstChar) existingLetters.add(firstChar);
        });

        const chips = this.alphabetChipsContainer.querySelectorAll('.letter-chip');
        chips.forEach(chip => {
            const letter = chip.dataset.letter;
            chip.classList.toggle('active', this.currentLetter === letter);

            if (letter !== 'all') {
                chip.classList.toggle('has-students', existingLetters.has(letter));
            }
        });
    }

    getFilteredStudents() {
        const filtered = this.students.filter(student => {
            const isExpired = this.isSubscriptionExpired(student.subscriptionEndDate);
            const isExpiring = this.isSubscriptionExpiringSoon(student.subscriptionEndDate);

            let matchesFilter = true;
            if (this.currentFilter === 'active') {
                matchesFilter = student.status === 'active' && !isExpired;
            } else if (this.currentFilter === 'expiring') {
                matchesFilter = student.status === 'active' && isExpiring;
            } else if (this.currentFilter === 'expired') {
                matchesFilter = student.status === 'active' && isExpired;
            } else if (this.currentFilter === 'passive') {
                matchesFilter = student.status === 'passive';
            }

            // Baş Harfe Göre Filtreleme (Türkçe harf duyarlı)
            if (this.currentLetter && this.currentLetter !== 'all') {
                const firstChar = (student.fullName || '').trim().charAt(0).toLocaleUpperCase('tr');
                if (firstChar !== this.currentLetter) {
                    return false;
                }
            }

            const phoneStr = student.phoneNumber || '';
            const matchesSearch = !this.searchQuery ||
                student.fullName.toLowerCase().includes(this.searchQuery) ||
                student.studentNumber.includes(this.searchQuery) ||
                phoneStr.includes(this.searchQuery);

            return matchesFilter && matchesSearch;
        });

        return this.applySorting(filtered);
    }

    applySorting(list) {
        return list.sort((a, b) => {
            const nameA = (a.fullName || '').trim();
            const nameB = (b.fullName || '').trim();

            switch (this.currentSort) {
                case 'name-asc': // Varsayılan: A'dan Z'ye alfabetik
                    return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });

                case 'name-desc': // Z'den A'ya
                    return nameB.localeCompare(nameA, 'tr', { sensitivity: 'base' });

                case 'end-date-asc': { // Bitiş Tarihi: En yakından en uzağa
                    const timeA = a.subscriptionEndDate ? new Date(a.subscriptionEndDate).getTime() : Infinity;
                    const timeB = b.subscriptionEndDate ? new Date(b.subscriptionEndDate).getTime() : Infinity;
                    if (timeA !== timeB) return timeA - timeB;
                    return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });
                }

                case 'end-date-desc': { // Bitiş Tarihi: En uzaktan en yakına
                    const timeA = a.subscriptionEndDate ? new Date(a.subscriptionEndDate).getTime() : -Infinity;
                    const timeB = b.subscriptionEndDate ? new Date(b.subscriptionEndDate).getTime() : -Infinity;
                    if (timeA !== timeB) return timeB - timeA;
                    return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });
                }

                case 'reg-date-desc': { // Kayıt Tarihi: En yeni en üstte
                    const timeA = a.registrationDate ? new Date(a.registrationDate).getTime() : 0;
                    const timeB = b.registrationDate ? new Date(b.registrationDate).getTime() : 0;
                    if (timeA !== timeB) return timeB - timeA;
                    return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });
                }

                default:
                    return nameA.localeCompare(nameB, 'tr', { sensitivity: 'base' });
            }
        });
    }

    exportToCSV() {
        if (!isAdmin()) {
            this.showToast('Verileri dışa aktarma yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        if (this.students.length === 0) {
            this.showToast('Dışa aktarılacak kayıt bulunmuyor.', 'warning');
            return;
        }

        const headers = ["Ad Soyad", "Öğrenci No", "Telefon", "Kayıt Tarihi", "Bitiş Tarihi", "Durum", "Kalan Gün"];
        const rows = this.students.map(s => {
            const remaining = this.getRemainingDays(s.subscriptionEndDate);
            return [
                `"${(s.fullName || '').replace(/"/g, '""')}"`,
                `"${s.studentNumber || ''}"`,
                `"${s.phoneNumber || ''}"`,
                `"${s.registrationDate || ''}"`,
                `"${s.subscriptionEndDate || ''}"`,
                `"${s.status === 'active' ? 'Aktif' : 'Pasif'}"`,
                `"${remaining !== null ? remaining : ''}"`
            ];
        });

        // Add UTF-8 BOM for Turkish character support in Excel
        const csvContent = "\uFEFF" + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `kantin_ogrenci_listesi_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.showToast('Excel/CSV listesi indirildi.', 'success');
    }

    render() {
        this.updateStats();
        this.updateAlphabetChips();
        if (window.adminPanel && window.adminPanel.isOpen) window.adminPanel.refresh();

        // Standart kullanıcı ve Admin yetki arayüzü güncellemeleri
        const adminMode = isAdmin();
        if (this.exportCsvBtn) {
            this.exportCsvBtn.style.display = adminMode ? '' : 'none';
        }
        const openMenuBtn = document.getElementById('openMenuBtn');
        if (openMenuBtn) {
            openMenuBtn.style.display = adminMode ? '' : 'none';
        }
        if (this.adminActiveBar) {
            this.adminActiveBar.style.display = adminMode ? 'flex' : 'none';
        }

        const filteredStudents = this.getFilteredStudents();

        if (filteredStudents.length === 0) {
            let emptyMessage = 'Arama veya filtre kriterlerine uyan kayıt bulunamadı.';
            if (this.students.length === 0) {
                emptyMessage = 'Telefon hafızasına kaydetmek için yukarıdaki "+" (Yeni Öğrenci Ekle) butonuna dokunun.';
            } else if (this.currentLetter !== 'all') {
                emptyMessage = `"${this.currentLetter}" harfi ile başlayan öğrenci kaydı bulunamadı.`;
            }

            this.studentsList.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-identification-card"></i>
                    <h3>${this.students.length === 0 ? 'Henüz Öğrenci Eklenmedi' : 'Kayıt Bulunamadı'}</h3>
                    <p>${emptyMessage}</p>
                    ${this.currentLetter !== 'all' ? `
                        <button type="button" class="btn secondary" onclick="app.setLetterFilter('all')" style="margin-top: 10px; max-width: 240px;">
                            <i class="ph-bold ph-arrow-counter-clockwise"></i>
                            <span>Harf Filtresini Kaldır</span>
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        this.studentsList.innerHTML = filteredStudents.map(student => {
            const isActive = student.status === 'active';
            const isExpired = isActive && this.isSubscriptionExpired(student.subscriptionEndDate);
            const isExpiring = isActive && this.isSubscriptionExpiringSoon(student.subscriptionEndDate);
            const remainingDays = this.getRemainingDays(student.subscriptionEndDate);

            let statusClass = 'passive';
            let statusText = 'Pasif';
            let cardModifierClass = 'passive-card';

            if (isActive) {
                if (isExpired) {
                    statusClass = 'expired';
                    statusText = 'Süresi Doldu';
                    cardModifierClass = 'expired-card';
                } else if (isExpiring) {
                    statusClass = 'expiring';
                    statusText = 'Bitişi Yakın';
                    cardModifierClass = 'expiring-card';
                } else {
                    statusClass = 'active';
                    statusText = 'Aktif';
                    cardModifierClass = 'active-card';
                }
            }

            // Remaining Days Tag
            let remainingHtml = '';
            if (isActive) {
                if (isExpired) {
                    remainingHtml = `<span class="remaining-tag danger"><i class="ph ph-warning-circle"></i> Süresi ${Math.abs(remainingDays)} gün önce bitti</span>`;
                } else if (remainingDays === 0) {
                    remainingHtml = `<span class="remaining-tag warning"><i class="ph ph-clock"></i> Bugün son gün!</span>`;
                } else if (isExpiring) {
                    remainingHtml = `<span class="remaining-tag warning"><i class="ph ph-clock"></i> Son ${remainingDays} gün kaldı</span>`;
                } else {
                    remainingHtml = `<span class="remaining-tag success"><i class="ph ph-check"></i> ${remainingDays} gün kaldı</span>`;
                }
            }

            // WhatsApp / Call buttons if phone is available
            let contactButtonsHtml = '';
            if (student.phoneNumber) {
                const cleanPhone = student.phoneNumber.replace(/\D/g, '');
                const waPhone = cleanPhone.startsWith('0') ? '90' + cleanPhone.substring(1) : (cleanPhone.startsWith('90') ? cleanPhone : '90' + cleanPhone);
                const waMessage = encodeURIComponent(`Merhaba ${student.fullName}, kantin & yemekhane aboneliğiniz hakkında bilgilendirmedir.`);

                contactButtonsHtml = `
                    <div class="contact-quick-bar">
                        <a href="https://wa.me/${waPhone}?text=${waMessage}" target="_blank" class="contact-link-btn whatsapp" title="WhatsApp ile Mesaj Gönder">
                            <i class="ph ph-whatsapp-logo"></i> WhatsApp
                        </a>
                        <a href="tel:${student.phoneNumber}" class="contact-link-btn call" title="Telefonla Ara">
                            <i class="ph ph-phone"></i> Ara
                        </a>
                    </div>
                `;
            }

            const isPaid = student.odemeDurumu === true;

            return `
                <div class="student-card ${cardModifierClass}">
                    <div class="student-card-header">
                        <div class="student-info">
                            <h3>${student.fullName}</h3>
                            <div class="student-meta-tags">
                                <span class="student-meta-item"><i class="ph ph-identification-badge"></i> No: ${student.studentNumber}</span>
                                ${student.phoneNumber ? `<span class="student-meta-item"><i class="ph ph-phone"></i> ${student.phoneNumber}</span>` : ''}
                            </div>
                        </div>
                        <div class="student-header-right">
                            <span class="status-badge ${statusClass}">
                                ${statusText}
                            </span>
                            <button type="button" class="payment-status-btn ${isPaid ? 'paid' : 'unpaid'}" onclick="app.confirmPayment('${student.id}')" title="${isPaid ? 'Aylık ödeme onaylandı' : 'Aylık ödemeyi onaylamak için tıklayın'}">
                                ${isPaid ? '✓ Ödeme Yaptı' : '<i class="ph ph-hand-coins"></i> Ödeme Al'}
                            </button>
                        </div>
                    </div>
                    
                    <div class="student-card-body">
                        <div class="detail-item">
                            <span class="detail-label">Kayıt Tarihi</span>
                            <span class="detail-value">${this.formatDate(student.registrationDate)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Bitiş Tarihi</span>
                            <span class="detail-value">
                                ${this.formatDate(student.subscriptionEndDate)}
                                ${remainingHtml}
                            </span>
                        </div>
                    </div>

                    ${contactButtonsHtml}
                    
                    ${adminMode ? `
                    <div class="card-actions-wrapper">
                        <div class="card-quick-bar">
                            <button class="action-btn renew-btn" onclick="app.renewSubscription('${student.id}', 30)" title="Aboneliği 1 ay uzat">
                                <i class="ph ph-clock-counter-clockwise"></i>
                                +30G Uzat
                            </button>
                            <button class="action-btn edit-btn" onclick="app.editStudent('${student.id}')" title="Düzenle">
                                <i class="ph ph-pencil-simple"></i>
                                Düzenle
                            </button>
                            <button class="action-btn toggle-btn" onclick="app.toggleStatus('${student.id}')" title="Durum Değiştir">
                                <i class="ph ph-arrows-left-right"></i>
                                ${isActive ? 'Pasife Al' : 'Aktif Et'}
                            </button>
                            <button class="action-btn delete-btn" onclick="app.confirmDelete('${student.id}')" title="Kaydı Sil">
                                <i class="ph ph-trash"></i>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
}

// ============================================================
// YEMEK LİSTESİ SİSTEMİ (FIREBASE REALTIME DATABASE: aktif_menu)
// ============================================================
const AKTIF_MENU_NODE = 'aktif_menu';
const AKTIF_MENU_CACHE_KEY = 'kantin_aktif_menu_v1';
const MEAL_STORAGE_KEY = 'kantin_yemek_listesi_v1';
const MEAL_LEGACY_KEY = 'yemekListesi';

// Firebase 'aktif_menu' düğümü ilk kez oluşturulurken kullanılacak başlangıç verisi
const INITIAL_SEED_MENU_TEXT = [
    '02.11.2026 | Etli Nohut Sulusu | Bulgur Pilavı | Yoğurt',
    '03.11.2026 | Kıskalı Tas Kebabı | Pirinç Pilavı | Cacık',
    '04.11.2026 | Fırın Tavuk | Sebzeli Makarna | Yayla Çorbası',
    '05.11.2026 | Patlıcan Güveç | Bulgur Pilavı | Cacık',
    '06.11.2026 | Bezdirme Köfte | Pirinç Pilavı | Tarhana Çorbası',
    '09.11.2026 | Etli Kuru Fasulye | Pirinç Pilavı | Yoğurt',
    '10.11.2026 | Peynirli Ispanak Börek | Toyga Çorba | Salata',
    '11.11.2026 | Arap Tava | Pirinç Pilavı | Cacık',
    '12.11.2026 | Kadınbudu Köfte | Sebzeli Makarna | Yayla Çorbası',
    '13.11.2026 | Pilav Üstü Tavuk Döner | Mercimek Çorbası | Cacık',
    '23.11.2026 | Etli Kuru Fasulye | Bulgur Pilavı | Yoğurt',
    '24.11.2026 | Tavuk Haşlama | Pirinç Pilavı | Yoğurt',
    '25.11.2026 | Yoğurtlu Karnabahar | Sebzeli Makarna | Ezogelin Çorba',
    '26.11.2026 | Karnıyarık | Bulgur Pilavı | Yayla Çorbası',
    '27.11.2026 | İzmir Köfte | Pirinç Pilavı | Cacık',
    '30.11.2026 | Etli Nohut Sulusu | Bulgur Pilavı | Yoğurt'
].join('\n');

// Yerel (cihaz saati) bugünün tarihi: YYYY-MM-DD (UTC kayması olmadan)
function getLocalDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatIsoToDotDate(isoDate) {
    if (!isoDate || !isoDate.includes('-')) return isoDate || '';
    const [y, m, d] = isoDate.split('-');
    return `${d}.${m}.${y}`;
}

function guessMealCategory(name, position) {
    const n = String(name || '').toLocaleLowerCase('tr-TR');
    if (n.includes('çorba')) return 'Çorba';
    if (n.includes('yoğurt') && !n.includes('yoğurtlu')) return 'Salata / Meze';
    if (n.includes('cacık') || n.includes('salata') || n.includes('turşu') || n.includes('ezme')) return 'Salata / Meze';
    if (n.includes('ayran') || n.includes('şalgam') || n.includes('komposto') || n.includes('meyve suyu') || n.includes('hoşaf')) return 'İçecek';
    if (n.includes('tatlı') || n.includes('baklava') || n.includes('sütlaç') || n.includes('revani') || n.includes('puding') || n.includes('helva')) return 'Tatlı / Meyve';
    if (n.includes('pilav') || n.includes('makarna') || n.includes('erişte') || n.includes('spagetti')) {
        return position === 0 && n.includes('pilav üstü') ? 'Ana Yemek' : 'Pilav / Makarna';
    }
    if (position === 0) return 'Ana Yemek';
    return 'Pilav / Makarna';
}

function extractAktifMenuText(rawVal) {
    if (rawVal === null || rawVal === undefined) return '';
    if (typeof rawVal === 'string') return rawVal;
    if (typeof rawVal === 'object') {
        if (typeof rawVal.metin === 'string') return rawVal.metin;
        if (typeof rawVal.text === 'string') return rawVal.text;
        if (typeof rawVal.menu === 'string') return rawVal.menu;
        if (Array.isArray(rawVal)) {
            return rawVal.filter(Boolean).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
        }
        return Object.entries(rawVal).map(([k, v]) => {
            if (Array.isArray(v)) return `${k} | ${v.join(' | ')}`;
            return `${k} | ${String(v ?? '')}`;
        }).join('\n');
    }
    return String(rawVal);
}

function splitDishItems(lineRest) {
    const cleaned = String(lineRest || '').trim();
    if (!cleaned) return [];
    let parts;
    if (cleaned.includes('|')) {
        parts = cleaned.split('|');
    } else if (cleaned.includes('\t')) {
        parts = cleaned.split('\t');
    } else if (cleaned.includes(';')) {
        parts = cleaned.split(';');
    } else if (cleaned.includes(',')) {
        parts = cleaned.split(',');
    } else if (/\s+[-–]\s+/.test(cleaned)) {
        parts = cleaned.split(/\s+[-–]\s+/);
    } else {
        parts = [cleaned];
    }
    return parts
        .map(p => p.replace(/^(?:\d+\s*[.)\-:]\s*(?:yemek\s*[:\-]?\s*)?|[•*▪▸]\s+)/i, '').trim())
        .filter(Boolean);
}

function parseLineDatePrefix(line) {
    // DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    const dmy = line.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b[\s|:\-–\t]*(.*)$/);
    if (dmy) {
        const day = dmy[1].padStart(2, '0');
        const month = dmy[2].padStart(2, '0');
        const year = dmy[3];
        return { date: `${year}-${month}-${day}`, rest: dmy[4] || '' };
    }
    // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
    const ymd = line.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})\b[\s|:\-–\t]*(.*)$/);
    if (ymd) {
        const year = ymd[1];
        const month = ymd[2].padStart(2, '0');
        const day = ymd[3].padStart(2, '0');
        return { date: `${year}-${month}-${day}`, rest: ymd[4] || '' };
    }
    return null;
}

function stripLeadingWeekday(text) {
    const trimmed = String(text || '').trim();
    const lower = trimmed.toLocaleLowerCase('tr-TR');
    const weekdays = ['pazartesi', 'çarşamba', 'carsamba', 'perşembe', 'persembe', 'cumartesi', 'salı', 'sali', 'cuma', 'pazar'];
    for (const wd of weekdays) {
        if (lower.startsWith(wd)) {
            const after = trimmed.slice(wd.length);
            if (!after || /^[\s|:\-–\t]/.test(after)) {
                return after.replace(/^[\s|:\-–\t]+/, '').trim();
            }
        }
    }
    return trimmed;
}

function parseAktifMenuText(rawText) {
    const normalized = String(rawText ?? '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
        return { mode: 'empty', meals: [] };
    }

    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    const datedMeals = [];

    lines.forEach((line, lineIdx) => {
        const parsedDate = parseLineDatePrefix(line);
        if (!parsedDate) return;
        const withoutDayName = stripLeadingWeekday(parsedDate.rest);
        const dishes = splitDishItems(withoutDayName);
        const seen = new Set();
        dishes.forEach((dishText, idx) => {
            // İsteğe bağlı "(320 kcal)" not ayrıştırması
            let name = dishText;
            let note = '';
            const noteMatch = dishText.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
            if (noteMatch && noteMatch[1].trim()) {
                name = noteMatch[1].trim();
                note = noteMatch[2].trim();
            }
            if (!name || seen.has(name)) return;
            seen.add(name);
            datedMeals.push({
                id: `fb_${parsedDate.date}_${lineIdx}_${idx + 1}`,
                date: parsedDate.date,
                category: guessMealCategory(name, idx),
                name,
                note,
                official: true
            });
        });
    });

    if (datedMeals.length > 0) {
        return { mode: 'dated', meals: datedMeals };
    }

    // Haftanın günleriyle yazılmış menü kontrolü (örn: "Pazartesi: Kuru Fasulye, Pilav")
    const weekdayMap = {
        pazartesi: 1, 'salı': 2, sali: 2, 'çarşamba': 3, carsamba: 3,
        'perşembe': 4, persembe: 4, cuma: 5, cumartesi: 6, pazar: 0
    };
    const weekdayEntries = [];
    lines.forEach((line, lineIdx) => {
        const m = line.match(/^([A-Za-zÇĞİÖŞÜçğıöşü]+)\s*[:|\-–\t]\s*(.+)$/);
        if (!m) return;
        const key = m[1].toLocaleLowerCase('tr-TR');
        if (Object.prototype.hasOwnProperty.call(weekdayMap, key)) {
            weekdayEntries.push({ targetDay: weekdayMap[key], rest: m[2], lineIdx });
        }
    });

    if (weekdayEntries.length >= 2) {
        const now = new Date();
        const currentDow = now.getDay(); // 0=Pazar, 1=Pazartesi...
        const mondayOffset = currentDow === 0 ? -6 : 1 - currentDow;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
        const wdMeals = [];
        weekdayEntries.forEach(({ targetDay, rest, lineIdx }) => {
            const offset = targetDay === 0 ? 6 : targetDay - 1;
            const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + offset);
            const iso = getLocalDateString(d);
            const dishes = splitDishItems(rest);
            dishes.forEach((name, idx) => {
                wdMeals.push({
                    id: `fb_wd_${iso}_${lineIdx}_${idx + 1}`,
                    date: iso,
                    category: guessMealCategory(name, idx),
                    name,
                    note: '',
                    official: true
                });
            });
        });
        if (wdMeals.length > 0) {
            return { mode: 'weekday', meals: wdMeals };
        }
    }

    // Doğrudan düz metin / günlük menü modu (tarihsiz metinler doğrudan bugünün aktif menüsü olarak gösterilir)
    const today = getLocalDateString();
    const directDishes = [];
    lines.forEach((line) => {
        // Sadece başlık satırıysa (örn: "Günün Menüsü:" ve altında başka satırlar varsa) atla
        if (lines.length > 1 && /menü(sü)?\s*:?$/i.test(line) && !line.includes('|') && !line.includes(',')) {
            return;
        }
        const cleanedLine = line.replace(/^(?:günün\s+menüsü|aktif\s+menü)\s*[:\-]\s*/i, '');
        if (lines.length === 1 || cleanedLine.includes('|') || cleanedLine.includes('\t')) {
            directDishes.push(...splitDishItems(cleanedLine));
        } else {
            const single = cleanedLine.replace(/^(?:\d+\s*[.)\-:]\s*(?:yemek\s*[:\-]?\s*)?|[•*▪▸\-]\s+)/i, '').trim();
            if (single) directDishes.push(single);
        }
    });

    const directMeals = directDishes.map((dishText, idx) => {
        let name = dishText;
        let note = '';
        const noteMatch = dishText.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
        if (noteMatch && noteMatch[1].trim()) {
            name = noteMatch[1].trim();
            note = noteMatch[2].trim();
        }
        return {
            id: `fb_direct_${idx + 1}`,
            date: today,
            category: guessMealCategory(name, idx),
            name,
            note,
            official: true
        };
    });

    return { mode: 'direct', meals: directMeals };
}

function serializeMealsToMenuText(meals, mode = 'dated') {
    if (!Array.isArray(meals) || meals.length === 0) return '';
    const uniqueDates = new Set(meals.map(m => m.date).filter(Boolean));
    if (mode === 'direct' && uniqueDates.size <= 1) {
        return meals.map(m => m.note ? `${m.name} (${m.note})` : m.name).join('\n');
    }
    const grouped = new Map();
    meals.forEach(m => {
        const d = m.date || getLocalDateString();
        if (!grouped.has(d)) grouped.set(d, []);
        grouped.get(d).push(m.note ? `${m.name} (${m.note})` : m.name);
    });
    return Array.from(grouped.keys())
        .sort()
        .map(d => `${formatIsoToDotDate(d)} | ${grouped.get(d).join(' | ')}`)
        .join('\n');
}

class MealManager {
    constructor() {
        this.activeMenuText = '';
        this.menuMode = 'loading';
        this.meals = [];
        this.syncSource = 'connecting';
        this.isLoadingFromFirebase = true;
        this.hasReceivedFirebaseData = false;
        this.selectedDate = getLocalDateString();
        this.currentDay = this.selectedDate;

        this.initDOM();
        this.bindEvents();
        this.render();
        this.listenAktifMenu();
        this.startDayWatcher();
    }

    initDOM() {
        // Modal & Buttons
        this.mealModal = document.getElementById('mealModal');
        this.menuModalBtn = document.getElementById('menuModalBtn');
        this.openMenuBtn = document.getElementById('openMenuBtn');
        this.closeMealModalBtn = document.getElementById('closeMealModalBtn');
        this.closeMealDoneBtn = document.getElementById('closeMealDoneBtn');

        // Form
        this.mealForm = document.getElementById('mealForm');
        this.mealSelectedDate = document.getElementById('mealSelectedDate');
        this.mealCategory = document.getElementById('mealCategory');
        this.mealName = document.getElementById('mealName');
        this.mealNote = document.getElementById('mealNote');
        this.addSampleMenuBtn = document.getElementById('addSampleMenuBtn');
        this.shareMenuWhatsappBtn = document.getElementById('shareMenuWhatsappBtn');

        // Lists & Indicators
        this.mealItemsList = document.getElementById('mealItemsList');
        this.mealListDateTitle = document.getElementById('mealListDateTitle');
        this.mealCountBadge = document.getElementById('mealCountBadge');
        this.menuPreviewList = document.getElementById('menuPreviewList');
        this.menuTodayDateText = document.getElementById('menuTodayDateText');
    }

    bindEvents() {
        // Open modal
        if (this.menuModalBtn) {
            this.menuModalBtn.addEventListener('click', () => this.openModal());
        }
        if (this.openMenuBtn) {
            this.openMenuBtn.addEventListener('click', () => this.openModal());
        }

        // Close modal
        if (this.closeMealModalBtn) {
            this.closeMealModalBtn.addEventListener('click', () => this.closeModal());
        }
        if (this.closeMealDoneBtn) {
            this.closeMealDoneBtn.addEventListener('click', () => this.closeModal());
        }
        if (this.mealModal) {
            this.mealModal.addEventListener('click', (e) => {
                if (e.target === this.mealModal) this.closeModal();
            });
        }

        // Date selection
        if (this.mealSelectedDate) {
            this.mealSelectedDate.value = this.selectedDate;
            this.mealSelectedDate.addEventListener('change', (e) => {
                this.selectedDate = e.target.value;
                this.renderModalList();
            });
        }

        // Form submission (Add Meal)
        if (this.mealForm) {
            this.mealForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddMeal();
            });
        }

        // Add sample 4-course menu
        if (this.addSampleMenuBtn) {
            this.addSampleMenuBtn.addEventListener('click', () => this.addSampleMenu());
        }

        // Share menu on WhatsApp
        if (this.shareMenuWhatsappBtn) {
            this.shareMenuWhatsappBtn.addEventListener('click', () => this.shareOnWhatsApp());
        }
    }

    getCachedMenuText() {
        try {
            const cached = localStorage.getItem(AKTIF_MENU_CACHE_KEY);
            if (cached !== null) return cached;
        } catch (e) {
            console.warn("Önbellek menü okuma uyarısı:", e);
        }
        return null;
    }

    saveCache(menuText) {
        try {
            localStorage.setItem(AKTIF_MENU_CACHE_KEY, menuText);
            const dataStr = JSON.stringify(this.meals);
            localStorage.setItem(MEAL_STORAGE_KEY, dataStr);
            localStorage.setItem(MEAL_LEGACY_KEY, dataStr);
        } catch (e) {
            console.warn("Menü önbellek yazma uyarısı:", e);
        }
    }

    applyMenuText(rawText, source = 'firebase') {
        const text = String(rawText ?? '').replace(/\r\n/g, '\n');
        const parsed = parseAktifMenuText(text);
        this.activeMenuText = text;
        this.menuMode = parsed.mode;
        this.meals = parsed.meals;
        this.syncSource = source;
        this.isLoadingFromFirebase = false;
        this.saveCache(text);
        this.render();
        if (window.adminPanel && typeof window.adminPanel.syncMenuEditor === 'function') {
            window.adminPanel.syncMenuEditor(text, source);
        }
    }

    getRestEndpoint() {
        const base = (firebaseConfig.databaseURL || '').replace(/\/+$/, '');
        return base ? `${base}/${AKTIF_MENU_NODE}.json` : '';
    }

    async fetchOrSeedViaRest() {
        const url = this.getRestEndpoint();
        if (!url) throw new Error('databaseURL tanımlı değil');
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data === null || data === undefined) {
            const seed = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
            this.applyMenuText(seed, 'firebase');
            fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(seed)
            }).catch(err => console.warn("REST aktif_menu ilk oluşturma uyarısı:", err));
            return;
        }
        this.hasReceivedFirebaseData = true;
        this.applyMenuText(extractAktifMenuText(data), 'firebase');
    }

    listenAktifMenu() {
        // Test ortamı adaptörü (varsa)
        const testAdapter = window.__KANTIN_RTDB_ADAPTER__;
        if (testAdapter && typeof testAdapter.onValue === 'function') {
            testAdapter.onValue(AKTIF_MENU_NODE, (val) => {
                if (val === null || val === undefined) {
                    const seed = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
                    this.hasReceivedFirebaseData = true;
                    this.applyMenuText(seed, 'firebase');
                    if (typeof testAdapter.set === 'function') {
                        testAdapter.set(AKTIF_MENU_NODE, seed);
                    }
                    return;
                }
                this.hasReceivedFirebaseData = true;
                this.applyMenuText(extractAktifMenuText(val), 'firebase');
            });
            return;
        }

        // 1. Firebase Realtime Database SDK üzerinden anlık (real-time) dinleyici
        if (rtdb && rtdbRef && rtdbOnValue) {
            try {
                const menuRef = rtdbRef(rtdb, AKTIF_MENU_NODE);
                rtdbOnValue(menuRef, (snapshot) => {
                    this.hasReceivedFirebaseData = true;
                    if (!snapshot.exists() || snapshot.val() === null) {
                        const seed = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
                        this.applyMenuText(seed, 'firebase');
                        if (rtdbSet) {
                            rtdbSet(menuRef, seed).catch((err) => {
                                console.warn("Firebase 'aktif_menu' başlangıç düğümü oluşturulamadı:", err);
                            });
                        }
                        return;
                    }
                    const text = extractAktifMenuText(snapshot.val());
                    this.applyMenuText(text, 'firebase');
                }, (error) => {
                    console.warn("Firebase 'aktif_menu' okuma hatası, yedek bağlantı deneniyor:", error);
                    this.fetchOrSeedViaRest().catch(() => {
                        const fallback = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
                        this.applyMenuText(fallback, 'offline');
                    });
                });

                // WebSocket bağlantısı 3.5 sn içinde yanıt vermezse REST/önbellek yedeğini devreye al
                setTimeout(() => {
                    if (!this.hasReceivedFirebaseData) {
                        this.fetchOrSeedViaRest().catch(() => {
                            if (!this.hasReceivedFirebaseData) {
                                const fallback = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
                                this.applyMenuText(fallback, 'offline');
                            }
                        });
                    }
                }, 3500);
                return;
            } catch (err) {
                console.warn("Firebase Realtime Database dinleyici başlatma hatası:", err);
            }
        }

        // 2. SDK yüklenemediyse doğrudan Firebase REST API -> çevrimdışı önbellek
        if (navigator.onLine) {
            this.fetchOrSeedViaRest().catch(() => {
                const fallback = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
                this.applyMenuText(fallback, 'offline');
            });
        } else {
            const fallback = this.getCachedMenuText() ?? INITIAL_SEED_MENU_TEXT;
            this.applyMenuText(fallback, 'offline');
        }
    }

    async updateAktifMenu(newMenuText) {
        if (!isAdmin()) {
            if (window.app) window.app.showToast('Yemek menüsü güncelleme yetkisi sadece yöneticilere aittir.', 'warning');
            return { ok: false, error: 'Yetkisiz işlem' };
        }

        const cleaned = String(newMenuText ?? '').replace(/\r\n/g, '\n').trim();

        // Test adaptörü kontrolü
        const testAdapter = window.__KANTIN_RTDB_ADAPTER__;
        if (testAdapter && typeof testAdapter.set === 'function') {
            await testAdapter.set(AKTIF_MENU_NODE, cleaned);
            this.applyMenuText(cleaned, 'firebase');
            return { ok: true, source: 'firebase' };
        }

        // 1. Firebase Realtime Database SDK ile 'aktif_menu' düğümünü güncelle
        if (rtdb && rtdbRef && rtdbSet && navigator.onLine) {
            try {
                const menuRef = rtdbRef(rtdb, AKTIF_MENU_NODE);
                const writePromise = rtdbSet(menuRef, cleaned);
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('RTDB_TIMEOUT')), 4500)
                );
                await Promise.race([writePromise, timeoutPromise]);
                this.hasReceivedFirebaseData = true;
                this.applyMenuText(cleaned, 'firebase');
                return { ok: true, source: 'firebase' };
            } catch (err) {
                if (err && err.message !== 'RTDB_TIMEOUT') {
                    console.warn("Firebase SDK yazma hatası, REST deneniyor:", err);
                }
            }
        }

        // 2. WebSocket zaman aşımına uğradıysa veya SDK yoksa Firebase REST PUT dene
        const url = this.getRestEndpoint();
        if (url && navigator.onLine) {
            try {
                const res = await fetch(url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cleaned)
                });
                if (!res.ok) {
                    const errBody = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status} ${errBody}`);
                }
                this.hasReceivedFirebaseData = true;
                this.applyMenuText(cleaned, 'firebase');
                return { ok: true, source: 'firebase' };
            } catch (restErr) {
                console.error("Firebase 'aktif_menu' güncelleme hatası:", restErr);
                this.applyMenuText(cleaned, 'offline');
                return { ok: false, error: restErr.message || 'Firebase bağlantı hatası' };
            }
        }

        // Çevrimdışıysa yerel önbelleği güncelle
        this.applyMenuText(cleaned, 'offline');
        return { ok: false, offline: true, error: 'Çevrimdışı mod' };
    }

    openModal() {
        if (!this.mealModal) return;
        if (window.app && window.app.triggerHaptic) window.app.triggerHaptic();
        if (this.mealSelectedDate) {
            this.mealSelectedDate.value = this.selectedDate;
        }
        this.mealModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.renderModalList();
    }

    closeModal() {
        if (!this.mealModal) return;
        this.mealModal.classList.remove('active');
        document.body.style.overflow = '';
        this.renderPreview();
    }

    async syncMealsListToFirebase() {
        const serialized = serializeMealsToMenuText(this.meals, this.menuMode === 'direct' ? 'direct' : 'dated');
        await this.updateAktifMenu(serialized);
    }

    async handleAddMeal() {
        if (!isAdmin()) {
            if (window.app) window.app.showToast('Yemek menüsü güncelleme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }

        const name = this.mealName ? this.mealName.value.trim() : '';
        const category = this.mealCategory ? this.mealCategory.value : 'Ana Yemek';
        const note = this.mealNote ? this.mealNote.value.trim() : '';
        const date = this.mealSelectedDate ? this.mealSelectedDate.value : this.selectedDate;

        if (!name) {
            if (window.app) window.app.showToast('Lütfen yemek adını girin.', 'warning');
            return;
        }

        const newMeal = {
            id: 'ymk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            date: date || this.selectedDate,
            category,
            name,
            note
        };

        this.meals.push(newMeal);
        if (this.menuMode === 'empty') this.menuMode = 'dated';

        if (this.mealName) this.mealName.value = '';
        if (this.mealNote) this.mealNote.value = '';
        if (this.mealName) this.mealName.focus();

        await this.syncMealsListToFirebase();

        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast(`"${name}" Firebase menüsüne eklendi.`, 'success');
        }
    }

    async deleteMeal(id) {
        if (!isAdmin()) {
            if (window.app) window.app.showToast('Yemek menüsü güncelleme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        this.meals = this.meals.filter(m => m.id !== id);
        await this.syncMealsListToFirebase();

        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast('Yemek Firebase menüsünden silindi.', 'info');
        }
    }

    async addSampleMenu() {
        if (!isAdmin()) {
            if (window.app) window.app.showToast('Yemek menüsü güncelleme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        const targetDate = this.mealSelectedDate ? this.mealSelectedDate.value : this.selectedDate;
        const samples = [
            { category: 'Çorba', name: 'Ezogelin Çorbası', note: '150 kcal' },
            { category: 'Ana Yemek', name: 'Orman Kebabı', note: '340 kcal' },
            { category: 'Pilav / Makarna', name: 'Şehriyeli Bulgur Pilavı', note: '210 kcal' },
            { category: 'Tatlı / Meyve', name: 'Kemalpaşa Tatlısı', note: '230 kcal' }
        ];

        samples.forEach(s => {
            this.meals.push({
                id: 'ymk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                date: targetDate,
                category: s.category,
                name: s.name,
                note: s.note
            });
        });

        if (this.menuMode === 'empty') this.menuMode = 'dated';
        await this.syncMealsListToFirebase();

        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast('Örnek 4 kap menü Firebase menüsüne eklendi.', 'success');
        }
    }

    getCategoryIcon(category) {
        switch (category) {
            case 'Çorba': return '🥣';
            case 'Ana Yemek': return '🍗';
            case 'Pilav / Makarna': return '🍚';
            case 'Tatlı / Meyve': return '🍰';
            case 'Salata / Meze': return '🥗';
            case 'İçecek': return '🥤';
            default: return '🍽️';
        }
    }

    formatDisplayDate(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        const dateObj = new Date(year, parseInt(month, 10) - 1, day);
        return dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
    }

    getMealsForDate(dateStr) {
        if (this.menuMode === 'direct') {
            return this.meals;
        }
        return this.meals.filter(m => m.date === dateStr);
    }

    shareOnWhatsApp() {
        const targetDate = this.mealSelectedDate ? this.mealSelectedDate.value : this.selectedDate;
        const dayMeals = this.getMealsForDate(targetDate);

        if (dayMeals.length === 0) {
            if (window.app) window.app.showToast('Paylaşılacak menü kaydı bulunmuyor.', 'warning');
            return;
        }

        let msg = `🍽️ *KANTİN & YEMEKHANE GÜNLÜK MENÜSÜ*\n📅 *Tarih:* ${this.formatDisplayDate(targetDate)}\n---------------------------------\n`;
        dayMeals.forEach((m, idx) => {
            msg += `${idx + 1}. ${this.getCategoryIcon(m.category)} *${m.category}:* ${m.name} ${m.note ? '(' + m.note + ')' : ''}\n`;
        });
        msg += `---------------------------------\nAfiyet olsun! ✨`;

        const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
        if (window.app) window.app.showToast('WhatsApp menü paylaşımı hazırlandı.', 'success');
    }

    renderModalList() {
        if (!this.mealItemsList) return;

        const targetDate = this.mealSelectedDate ? this.mealSelectedDate.value : this.selectedDate;
        const dayMeals = this.getMealsForDate(targetDate);

        if (this.mealListDateTitle) {
            this.mealListDateTitle.textContent = this.menuMode === 'direct'
                ? 'Aktif Yemek Menüsü'
                : `${this.formatDisplayDate(targetDate)} Menüsü`;
        }
        if (this.mealCountBadge) {
            this.mealCountBadge.textContent = `${dayMeals.length} Yemek`;
        }

        if (dayMeals.length === 0) {
            this.mealItemsList.innerHTML = `
                <div class="meal-empty-box">
                    <i class="ph-bold ph-cooking-pot"></i>
                    <p>Bu tarihe ait yemek menüsü bulunmuyor.</p>
                    <span style="font-size: 11px; color: #94a3b8;">${isAdmin() ? 'Admin panelindeki "Menüyü Güncelle" kutusundan veya yukarıdaki formdan menüyü güncelleyebilirsiniz.' : 'Hafta sonu veya resmi tatil günlerinde yemek servisi bulunmamaktadır.'}</span>
                </div>
            `;
            return;
        }

        const adminMode = isAdmin();
        this.mealItemsList.innerHTML = dayMeals.map(meal => `
            <div class="meal-item-card">
                <div class="meal-item-info">
                    <span class="meal-cat-badge">${this.getCategoryIcon(meal.category)} ${escapeHtml(meal.category)}</span>
                    <span class="meal-item-name">${escapeHtml(meal.name)}</span>
                    ${meal.note ? `<span class="meal-item-note">${escapeHtml(meal.note)}</span>` : ''}
                </div>
                ${adminMode ? `
                <button type="button" class="meal-del-btn" onclick="mealManager.deleteMeal('${escapeHtml(meal.id)}')" title="Yemeği Sil">
                    <i class="ph-bold ph-trash"></i>
                </button>
                ` : ''}
            </div>
        `).join('');
    }

    renderPreview() {
        const today = getLocalDateString();

        if (this.menuTodayDateText) {
            this.menuTodayDateText.textContent = this.formatDisplayDate(today);
        }

        if (!this.menuPreviewList) return;

        if (this.isLoadingFromFirebase) {
            this.menuPreviewList.innerHTML = `
                <span class="menu-empty-hint">Menü Firebase veritabanından yükleniyor...</span>
            `;
            return;
        }

        const todayMeals = this.getMealsForDate(today);

        if (this.menuMode === 'empty') {
            this.menuPreviewList.innerHTML = `
                <span class="menu-empty-hint">Aktif yemek menüsü henüz girilmemiş.</span>
            `;
            return;
        }

        if (todayMeals.length === 0) {
            this.menuPreviewList.innerHTML = `
                <span class="menu-empty-hint">Bugün için yemek menüsü bulunmuyor (hafta sonu / tatil). ${isAdmin() ? 'Menüyü yönetmek için butona dokunun.' : 'Tüm menüyü görmek için yemek ikonuna dokunun.'}</span>
            `;
            return;
        }

        this.menuPreviewList.innerHTML = todayMeals.map(m => `
            <div class="menu-preview-pill">
                <span>${this.getCategoryIcon(m.category)}</span>
                <span>${escapeHtml(m.name)}</span>
            </div>
        `).join('');
    }

    render() {
        this.renderPreview();
        this.renderModalList();
        if (window.adminPanel && window.adminPanel.isOpen) window.adminPanel.refresh();
    }

    // Gece yarısı gün değişince kartı otomatik yenile
    startDayWatcher() {
        setInterval(() => {
            const now = getLocalDateString();
            if (now !== this.currentDay) {
                const wasFollowingToday = this.selectedDate === this.currentDay;
                this.currentDay = now;
                if (wasFollowingToday) {
                    this.selectedDate = now;
                    if (this.mealSelectedDate) this.mealSelectedDate.value = now;
                }
                if (this.menuMode === 'direct' || this.menuMode === 'weekday') {
                    this.applyMenuText(this.activeMenuText, this.syncSource);
                } else {
                    this.render();
                }
            }
        }, 30000);
    }
}

// ============================================================
// YÖNETİM PANELİ (ADMIN PANEL MODULE)
// ============================================================
// NOT: İstemci tarafındaki statik şifre gerçek bir güvenlik sağlamaz (kaynak koddan okunabilir).
// Bulut veritabanına geçildiğinde bu kontrol sunucu taraflı kimlik doğrulama ile
// (ör. Firebase Authentication + Firestore Security Rules) değiştirilmelidir.
// Şifre ve oturum anahtarı dosya başında tanımlanmıştır.

/**
 * Admin veri kaynağı katmanı.
 */
const AdminDataSource = {
    getLabel() {
        return (db || rtdb) ? 'Bulut (Firebase) + Cihaz hafızası' : 'Cihaz hafızası';
    },
    async getStudents() {
        return (window.app && Array.isArray(window.app.students)) ? [...window.app.students] : [];
    },
    async getMeals() {
        return (window.mealManager && Array.isArray(window.mealManager.meals)) ? [...window.mealManager.meals] : [];
    }
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

class AdminPanel {
    constructor() {
        this.isOpen = false;
        this.activeTab = 'students';
        this.searchQuery = '';
        this.statusFilter = 'all';
        this.sort = { students: { key: 'fullName', dir: 'asc' }, meals: { key: 'date', dir: 'asc' } };
        this.data = { students: [], meals: [] };
        this.refreshQueued = false;
        this.eventsBound = false;

        this.init();

        // Aynı sekmede sayfa yenilense bile oturum korunur (sekme kapanınca sona erer)
        let hasSession = false;
        try { hasSession = sessionStorage.getItem(ADMIN_SESSION_KEY) === '1'; } catch (e) { /* yok say */ }
        if (hasSession) {
            document.body.classList.add('admin-theme');
            this.openPanel({ silent: true });
        } else {
            document.body.classList.remove('admin-theme');
            document.body.classList.remove('admin-mode');
        }
    }

    init() {
        this.initDOM();
        this.bindEvents();
        if (this.filterSelect) {
            this.populateFilterOptions();
        }
        return this;
    }

    initDOM() {
        this.fab = document.getElementById('adminFab');
        this.panel = document.getElementById('adminPanel');
        this.appContainer = document.querySelector('.app-container');

        // Giriş modalı
        this.loginModal = document.getElementById('adminLoginModal');
        this.loginCard = this.loginModal ? this.loginModal.querySelector('.admin-login-modal') : null;
        this.loginForm = document.getElementById('adminLoginForm');
        this.passwordInput = document.getElementById('adminPassword');
        this.togglePassBtn = document.getElementById('adminTogglePass');
        this.loginError = document.getElementById('adminLoginError');
        this.loginCancelBtn = document.getElementById('adminLoginCancelBtn');

        // Panel kontrolleri
        this.logoutBtn = document.getElementById('adminLogoutBtn');
        this.refreshBtn = document.getElementById('adminRefreshBtn');
        this.exportBtn = document.getElementById('adminExportBtn');
        this.viewAppBtn = document.getElementById('adminViewAppBtn');
        this.activeBar = document.getElementById('adminActiveBar');
        this.activePanelBtn = document.getElementById('adminActivePanelBtn');
        this.activeLogoutBtn = document.getElementById('adminActiveLogoutBtn');
        this.sourceStatus = document.getElementById('adminSourceStatus');
        this.tabs = document.querySelectorAll('.admin-tab');
        this.searchInput = document.getElementById('adminSearchInput');
        this.filterSelect = document.getElementById('adminStatusFilter');

        // Tablo
        this.tableHead = document.getElementById('adminTableHead');
        this.tableBody = document.getElementById('adminTableBody');
        this.emptyState = document.getElementById('adminEmpty');
        this.rowInfo = document.getElementById('adminRowInfo');
        this.lastUpdated = document.getElementById('adminLastUpdated');

        // İstatistikler
        this.statTotal = document.getElementById('adminStatTotal');
        this.statActive = document.getElementById('adminStatActive');
        this.statExpiring = document.getElementById('adminStatExpiring');
        this.statExpired = document.getElementById('adminStatExpired');
        this.tabStudentsCount = document.getElementById('adminTabStudentsCount');
        this.tabMealsCount = document.getElementById('adminTabMealsCount');

        // Menüyü Güncelle (Firebase aktif_menu)
        this.menuUpdateCard = document.getElementById('adminMenuUpdateCard');
        this.menuUpdateForm = document.getElementById('adminMenuUpdateForm');
        this.menuTextarea = document.getElementById('adminMenuTextarea');
        this.saveMenuBtn = document.getElementById('adminSaveMenuBtn');
        this.menuSyncStatus = document.getElementById('adminMenuSyncStatus');
    }

    bindEvents() {
        if (this.fab && !this.fab._adminBound) {
            this.fab._adminBound = true;
            this.fab.addEventListener('click', (e) => {
                e.preventDefault();
                this.haptic();
                if (this.isAuthenticated()) {
                    this.openPanel();
                } else {
                    this.openLogin();
                }
            });
        }

        // Giriş modalı
        if (this.loginForm && !this.loginForm._adminBound) {
            this.loginForm._adminBound = true;
            this.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }
        if (this.loginCancelBtn && !this.loginCancelBtn._adminBound) {
            this.loginCancelBtn._adminBound = true;
            this.loginCancelBtn.addEventListener('click', () => this.closeLogin());
        }
        if (this.loginModal && !this.loginModal._adminBound) {
            this.loginModal._adminBound = true;
            this.loginModal.addEventListener('click', (e) => {
                if (e.target === this.loginModal) this.closeLogin();
            });
        }
        if (this.togglePassBtn && !this.togglePassBtn._adminBound) {
            this.togglePassBtn._adminBound = true;
            this.togglePassBtn.addEventListener('click', () => {
                if (!this.passwordInput) return;
                const show = this.passwordInput.type === 'password';
                this.passwordInput.type = show ? 'text' : 'password';
                this.togglePassBtn.innerHTML = `<i class="ph ${show ? 'ph-eye-slash' : 'ph-eye'}"></i>`;
                this.togglePassBtn.setAttribute('aria-label', show ? 'Şifreyi gizle' : 'Şifreyi göster');
                this.passwordInput.focus();
            });
        }
        if (this.passwordInput && !this.passwordInput._adminBound) {
            this.passwordInput._adminBound = true;
            this.passwordInput.addEventListener('input', () => {
                if (this.loginError) this.loginError.textContent = '';
            });
        }
        if (!this._escapeBound) {
            this._escapeBound = true;
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.loginModal && this.loginModal.classList.contains('active')) {
                    this.closeLogin();
                }
            });
        }

        // Panel
        if (this.logoutBtn && !this.logoutBtn._adminBound) {
            this.logoutBtn._adminBound = true;
            this.logoutBtn.addEventListener('click', () => this.logout());
        }
        if (this.refreshBtn && !this.refreshBtn._adminBound) {
            this.refreshBtn._adminBound = true;
            this.refreshBtn.addEventListener('click', () => this.refresh({ animate: true }));
        }
        if (this.exportBtn && !this.exportBtn._adminBound) {
            this.exportBtn._adminBound = true;
            this.exportBtn.addEventListener('click', () => this.exportCSV());
        }
        if (this.viewAppBtn && !this.viewAppBtn._adminBound) {
            this.viewAppBtn._adminBound = true;
            this.viewAppBtn.addEventListener('click', () => this.closePanelToApp());
        }
        if (this.activePanelBtn && !this.activePanelBtn._adminBound) {
            this.activePanelBtn._adminBound = true;
            this.activePanelBtn.addEventListener('click', () => this.openPanel());
        }
        if (this.activeLogoutBtn && !this.activeLogoutBtn._adminBound) {
            this.activeLogoutBtn._adminBound = true;
            this.activeLogoutBtn.addEventListener('click', () => this.logout());
        }

        if (this.tabs) {
            this.tabs.forEach(tab => {
                if (!tab._adminBound) {
                    tab._adminBound = true;
                    tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
                }
            });
        }

        if (this.searchInput && !this.searchInput._adminBound) {
            this.searchInput._adminBound = true;
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLocaleLowerCase('tr-TR').trim();
                this.renderTable();
            });
        }

        if (this.filterSelect && !this.filterSelect._adminBound) {
            this.filterSelect._adminBound = true;
            this.filterSelect.addEventListener('change', (e) => {
                this.statusFilter = e.target.value;
                this.renderTable();
            });
        }

        // Sütün başlığına tıklayınca sıralama
        if (this.tableHead && !this.tableHead._adminBound) {
            this.tableHead._adminBound = true;
            this.tableHead.addEventListener('click', (e) => {
                const th = e.target.closest('th[data-key]');
                if (!th) return;
                const current = this.sort[this.activeTab];
                if (current.key === th.dataset.key) {
                    current.dir = current.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    current.key = th.dataset.key;
                    current.dir = 'asc';
                }
                this.renderTable();
            });
        }

        // Menüyü Güncelle (Firebase aktif_menu) formu
        if (this.menuUpdateForm && !this.menuUpdateForm._adminBound) {
            this.menuUpdateForm._adminBound = true;
            this.menuUpdateForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSaveMenu();
            });
        }
    }

    syncMenuEditor(menuText, source = 'firebase', { force = false } = {}) {
        if (this.menuTextarea && (force || document.activeElement !== this.menuTextarea)) {
            this.menuTextarea.value = menuText ?? '';
        }
        if (this.menuSyncStatus) {
            if (source === 'firebase') {
                this.menuSyncStatus.innerHTML = '<i class="ph-bold ph-cloud-check"></i> Firebase: aktif_menu bağlı';
            } else {
                this.menuSyncStatus.innerHTML = '<i class="ph-bold ph-cloud-slash"></i> Çevrimdışı Önbellek';
            }
        }
    }

    async handleSaveMenu() {
        if (!this.isAuthenticated()) {
            this.toast('Menü güncelleme yetkisi sadece yöneticilere aittir.', 'warning');
            return;
        }
        if (!window.mealManager || !this.menuTextarea) return;

        this.haptic();
        const newText = this.menuTextarea.value;
        const originalBtnHtml = this.saveMenuBtn ? this.saveMenuBtn.innerHTML : '';

        if (this.saveMenuBtn) {
            this.saveMenuBtn.disabled = true;
            this.saveMenuBtn.innerHTML = '<i class="ph-bold ph-arrows-clockwise"></i><span>Kaydediliyor...</span>';
        }

        try {
            const result = await window.mealManager.updateAktifMenu(newText);
            this.syncMenuEditor(window.mealManager.activeMenuText, window.mealManager.syncSource, { force: true });
            await this.refresh();

            if (result && result.ok) {
                this.toast('Menü Firebase veritabanında (aktif_menu) başarıyla güncellendi!', 'success');
            } else if (result && result.offline) {
                this.toast('İnternet bağlantısı yok: Menü cihaz önbelleğine kaydedildi.', 'warning');
            } else {
                this.toast(`Firebase yazma hatası: ${(result && result.error) || 'Bağlantı kurulamadı'}`, 'error');
            }
        } catch (err) {
            console.error('Menü güncelleme hatası:', err);
            this.toast('Menü güncellenirken beklenmeyen bir hata oluştu.', 'error');
        } finally {
            if (this.saveMenuBtn) {
                this.saveMenuBtn.disabled = false;
                this.saveMenuBtn.innerHTML = originalBtnHtml;
            }
        }
    }

    haptic() {
        if (window.app && window.app.triggerHaptic) window.app.triggerHaptic();
    }

    toast(msg, type = 'info') {
        if (window.app && window.app.showToast) window.app.showToast(msg, type);
    }

    // ---------- Giriş / Çıkış ----------
    openLogin() {
        this.init();
        if (this.passwordInput) {
            this.passwordInput.value = '';
            this.passwordInput.type = 'password';
        }
        if (this.togglePassBtn) {
            this.togglePassBtn.innerHTML = '<i class="ph ph-eye"></i>';
        }
        if (this.loginError) {
            this.loginError.textContent = '';
        }
        if (this.loginModal) {
            this.loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                if (this.passwordInput) this.passwordInput.focus();
            }, 250);
        }
    }

    closeLogin() {
        if (this.loginModal) {
            this.loginModal.classList.remove('active');
        }
        document.body.style.overflow = '';
        if (this.passwordInput) {
            this.passwordInput.blur();
        }
    }

    handleLogin() {
        const value = this.passwordInput.value;
        if (!value) {
            this.showLoginError('Lütfen şifrenizi girin.');
            return;
        }
        if (value !== ADMIN_PASSWORD) {
            this.showLoginError('Hatalı şifre. Lütfen tekrar deneyin.');
            this.passwordInput.value = '';
            if ('vibrate' in navigator) navigator.vibrate([40, 40, 40]);
            return;
        }

        try { sessionStorage.setItem(ADMIN_SESSION_KEY, '1'); } catch (e) { /* yok say */ }
        this.closeLogin();
        this.openPanel();
    }

    showLoginError(message) {
        this.loginError.textContent = message;
        if (this.loginCard) {
            this.loginCard.classList.remove('shake');
            void this.loginCard.offsetWidth; // animasyonu yeniden tetikle
            this.loginCard.classList.add('shake');
        }
        this.passwordInput.focus();
    }

    openPanel({ silent = false } = {}) {
        // Açık kalmış tüm modalları kapat
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        document.body.style.overflow = '';

        document.body.classList.add('admin-mode');
        document.body.classList.add('admin-theme'); // Yönetici Temasını Devreye Al
        if (this.appContainer) this.appContainer.style.display = 'none';
        if (this.fab) this.fab.style.display = 'none';
        if (this.panel) this.panel.style.display = 'block';
        this.isOpen = true;
        window.scrollTo(0, 0);

        this.refresh();
        if (window.app) window.app.render();
        if (window.mealManager) {
            window.mealManager.render();
            this.syncMenuEditor(window.mealManager.activeMenuText, window.mealManager.syncSource, { force: true });
        }
        if (!silent) {
            this.haptic();
            this.toast('Yönetim paneline giriş yapıldı. Yönetici teması ve yetkileri aktif.', 'success');
        }
    }

    /**
     * Yönetim panelinden Kantin Ana Ekranına geçiş yapar.
     * Admin oturumu ve teması korunur, yönetici kartlar üzerinde tüm yetkileri kullanabilir.
     */
    closePanelToApp() {
        this.isOpen = false;
        if (this.panel) this.panel.style.display = 'none';
        document.body.classList.remove('admin-mode');
        document.body.classList.add('admin-theme'); // Tema korunur
        if (this.appContainer) this.appContainer.style.display = '';
        if (this.fab) this.fab.style.display = '';
        window.scrollTo(0, 0);

        if (window.app) window.app.render();
        if (window.mealManager) window.mealManager.render();
    }

    logout() {
        this.haptic();
        try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) { /* yok say */ }

        this.isOpen = false;
        if (this.panel) this.panel.style.display = 'none';
        document.body.classList.remove('admin-mode');
        document.body.classList.remove('admin-theme'); // Yönetici Teması Kaldırılır
        if (this.appContainer) this.appContainer.style.display = '';
        if (this.fab) this.fab.style.display = '';
        window.scrollTo(0, 0);

        if (window.app) window.app.render();
        if (window.mealManager) window.mealManager.render();
        this.toast('Yönetici oturumu kapatıldı. Standart kullanıcı kısıtlamaları devrede.', 'info');
    }

    isAuthenticated() {
        return isAdmin();
    }

    // ---------- Veri ----------
    async refresh({ animate = false } = {}) {
        if (!this.isOpen) return;
        // Aynı anda gelen çoklu render çağrılarını tek güncellemede birleştir
        if (this.refreshQueued) return;
        this.refreshQueued = true;
        if (animate) this.refreshBtn.classList.add('spinning');

        await Promise.resolve();
        try {
            const [students, meals] = await Promise.all([
                AdminDataSource.getStudents(),
                AdminDataSource.getMeals()
            ]);
            this.data.students = students.map(s => this.normalizeStudent(s));
            this.data.meals = meals.map(m => this.normalizeMeal(m));
            this.renderStatus();
            this.renderStats();
            this.renderTable();
            if (this.lastUpdated) {
                this.lastUpdated.textContent = `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            }
            if (animate) this.toast('Veriler yenilendi.', 'success');
        } catch (err) {
            console.error('Admin veri yükleme hatası:', err);
            this.toast('Veriler yüklenemedi.', 'error');
        } finally {
            this.refreshQueued = false;
            if (animate) setTimeout(() => this.refreshBtn.classList.remove('spinning'), 500);
        }
    }

    getRemainingDays(dateString) {
        if (!dateString) return null;
        const end = new Date(dateString);
        if (isNaN(end.getTime())) return null;
        end.setHours(23, 59, 59, 999);
        return Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24));
    }

    normalizeStudent(s) {
        const remaining = this.getRemainingDays(s.subscriptionEndDate);
        let state = 'passive';
        if (s.status === 'active') {
            if (remaining !== null && remaining < 0) state = 'expired';
            else if (remaining !== null && remaining <= 3) state = 'expiring';
            else state = 'active';
        }
        return { ...s, remaining, state };
    }

    normalizeMeal(m) {
        return { ...m, source: m.official ? 'official' : 'user' };
    }

    // ---------- Yapılandırma ----------
    getColumns() {
        if (this.activeTab === 'students') {
            return [
                { key: '_index', label: '#', sortable: false },
                { key: 'fullName', label: 'Ad Soyad' },
                { key: 'studentNumber', label: 'Öğrenci No' },
                { key: 'phoneNumber', label: 'Telefon' },
                { key: 'registrationDate', label: 'Kayıt Tarihi' },
                { key: 'subscriptionEndDate', label: 'Bitiş Tarihi' },
                { key: 'remaining', label: 'Kalan Gün' },
                { key: 'state', label: 'Durum' }
            ];
        }
        return [
            { key: '_index', label: '#', sortable: false },
            { key: 'date', label: 'Tarih' },
            { key: 'category', label: 'Kategori' },
            { key: 'name', label: 'Yemek' },
            { key: 'note', label: 'Not' },
            { key: 'source', label: 'Kaynak' }
        ];
    }

    getFilterOptions() {
        if (this.activeTab === 'students') {
            return [
                ['all', 'Tüm Durumlar'],
                ['active', 'Aktif'],
                ['expiring', 'Bitişi Yakın'],
                ['expired', 'Süresi Dolan'],
                ['passive', 'Pasif']
            ];
        }
        return [
            ['all', 'Tüm Tarihler'],
            ['today', 'Bugün'],
            ['upcoming', 'Gelecek Günler'],
            ['past', 'Geçmiş Günler'],
            ['user', 'Elle Eklenenler']
        ];
    }

    populateFilterOptions() {
        this.filterSelect.innerHTML = this.getFilterOptions()
            .map(([val, label]) => `<option value="${val}">${label}</option>`)
            .join('');
        this.filterSelect.value = 'all';
        this.statusFilter = 'all';
    }

    switchTab(tab) {
        if (tab === this.activeTab) return;
        this.haptic();
        this.activeTab = tab;
        this.tabs.forEach(t => {
            const active = t.dataset.tab === tab;
            t.classList.toggle('active', active);
            t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        this.searchInput.value = '';
        this.searchQuery = '';
        this.searchInput.placeholder = tab === 'students'
            ? 'İsim, öğrenci no veya telefon ara...'
            : 'Yemek adı, kategori veya not ara...';
        this.populateFilterOptions();
        this.renderTable();
    }

    // ---------- Filtreleme & Sıralama ----------
    getVisibleRows() {
        const tab = this.activeTab;
        const q = this.searchQuery;
        const filter = this.statusFilter;
        const today = getLocalDateString();

        let rows = this.data[tab].filter(row => {
            if (tab === 'students') {
                if (filter === 'active' && !(row.state === 'active' || row.state === 'expiring')) return false;
                if (filter !== 'all' && filter !== 'active' && row.state !== filter) return false;
                if (q) {
                    const hay = `${row.fullName || ''} ${row.studentNumber || ''} ${row.phoneNumber || ''}`.toLocaleLowerCase('tr-TR');
                    if (!hay.includes(q)) return false;
                }
            } else {
                if (filter === 'today' && row.date !== today) return false;
                if (filter === 'upcoming' && !(row.date > today)) return false;
                if (filter === 'past' && !(row.date < today)) return false;
                if (filter === 'user' && row.source !== 'user') return false;
                if (q) {
                    const hay = `${row.name || ''} ${row.category || ''} ${row.note || ''} ${row.date || ''}`.toLocaleLowerCase('tr-TR');
                    if (!hay.includes(q)) return false;
                }
            }
            return true;
        });

        const { key, dir } = this.sort[tab];
        const mult = dir === 'asc' ? 1 : -1;
        const stateRank = { expired: 0, expiring: 1, active: 2, passive: 3 };

        rows.sort((a, b) => {
            let va = a[key];
            let vb = b[key];
            if (key === 'state') { va = stateRank[va]; vb = stateRank[vb]; }
            const aEmpty = va === null || va === undefined || va === '';
            const bEmpty = vb === null || vb === undefined || vb === '';
            if (aEmpty && bEmpty) return 0;
            if (aEmpty) return 1;   // boş değerler her zaman en sonda
            if (bEmpty) return -1;
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult;
            return String(va).localeCompare(String(vb), 'tr', { sensitivity: 'base', numeric: true }) * mult;
        });

        return rows;
    }

    // ---------- Render ----------
    formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return escapeHtml(dateStr);
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    renderStatus() {
        if (!this.sourceStatus) return;
        const online = navigator.onLine;
        this.sourceStatus.innerHTML = `
            <span class="status-dot ${online ? '' : 'offline'}"></span>
            Veri kaynağı: ${escapeHtml(AdminDataSource.getLabel())}${online ? '' : ' (çevrimdışı)'}
        `;
    }

    renderStats() {
        const s = this.data.students;
        const count = (fn) => s.filter(fn).length;
        this.statTotal.textContent = s.length;
        this.statActive.textContent = count(r => r.state === 'active' || r.state === 'expiring');
        this.statExpiring.textContent = count(r => r.state === 'expiring');
        this.statExpired.textContent = count(r => r.state === 'expired');
        this.tabStudentsCount.textContent = s.length;
        this.tabMealsCount.textContent = this.data.meals.length;
    }

    renderHead(columns) {
        const { key, dir } = this.sort[this.activeTab];
        this.tableHead.innerHTML = `<tr>${columns.map(col => {
            if (col.sortable === false) return `<th>${col.label}</th>`;
            const sorted = col.key === key;
            const icon = sorted ? (dir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down';
            return `<th class="sortable ${sorted ? 'sorted' : ''}" data-key="${col.key}" aria-sort="${sorted ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}">
                ${col.label}<i class="ph-bold ${icon} sort-ind"></i>
            </th>`;
        }).join('')}</tr>`;
    }

    renderStudentCells(row, idx) {
        const stateMap = {
            active: ['active', 'Aktif'],
            expiring: ['expiring', 'Bitişi Yakın'],
            expired: ['expired', 'Süresi Doldu'],
            passive: ['passive', 'Pasif']
        };
        const [badgeClass, badgeText] = stateMap[row.state];

        let remainingHtml = '<span class="admin-remaining muted">—</span>';
        if (row.remaining !== null && row.state !== 'passive') {
            const tone = row.state === 'expired' ? 'danger' : row.state === 'expiring' ? 'warning' : 'success';
            const text = row.remaining < 0 ? `${Math.abs(row.remaining)} gün geçti` : row.remaining === 0 ? 'Bugün son' : `${row.remaining} gün`;
            remainingHtml = `<span class="admin-remaining ${tone}">${text}</span>`;
        }

        return `
            <td class="cell-index" data-label="#">${idx + 1}</td>
            <td class="cell-strong" data-label="Ad Soyad">${escapeHtml(row.fullName) || '—'}</td>
            <td class="cell-mono" data-label="Öğrenci No">${escapeHtml(row.studentNumber) || '—'}</td>
            <td class="cell-mono ${row.phoneNumber ? '' : 'cell-muted'}" data-label="Telefon">${escapeHtml(row.phoneNumber) || '—'}</td>
            <td data-label="Kayıt Tarihi">${this.formatDate(row.registrationDate)}</td>
            <td data-label="Bitiş Tarihi">${this.formatDate(row.subscriptionEndDate)}</td>
            <td data-label="Kalan Gün">${remainingHtml}</td>
            <td data-label="Durum"><span class="status-badge ${badgeClass}">${badgeText}</span></td>
        `;
    }

    renderMealCells(row, idx) {
        const icon = window.mealManager ? window.mealManager.getCategoryIcon(row.category) : '🍽️';
        const sourceTag = row.source === 'official'
            ? '<span class="admin-source-tag"><i class="ph-bold ph-cloud-check"></i> Firebase (aktif_menu)</span>'
            : '<span class="admin-source-tag user"><i class="ph-bold ph-user"></i> Elle Eklendi</span>';
        return `
            <td class="cell-index" data-label="#">${idx + 1}</td>
            <td data-label="Tarih">${this.formatDate(row.date)}</td>
            <td data-label="Kategori">${icon} ${escapeHtml(row.category) || '—'}</td>
            <td class="cell-strong" data-label="Yemek">${escapeHtml(row.name) || '—'}</td>
            <td class="${row.note ? '' : 'cell-muted'}" data-label="Not">${escapeHtml(row.note) || '—'}</td>
            <td data-label="Kaynak">${sourceTag}</td>
        `;
    }

    renderTable() {
        const columns = this.getColumns();
        const rows = this.getVisibleRows();
        const total = this.data[this.activeTab].length;

        this.renderHead(columns);

        const renderCells = this.activeTab === 'students'
            ? (r, i) => this.renderStudentCells(r, i)
            : (r, i) => this.renderMealCells(r, i);

        // İlk 30 satırda kısa kademeli giriş animasyonu
        this.tableBody.innerHTML = rows.map((row, i) =>
            `<tr style="animation-delay:${Math.min(i, 30) * 12}ms">${renderCells(row, i)}</tr>`
        ).join('');

        const isEmpty = rows.length === 0;
        this.emptyState.hidden = !isEmpty;
        if (isEmpty) {
            const h3 = this.emptyState.querySelector('h3');
            const p = this.emptyState.querySelector('p');
            if (total === 0) {
                h3.textContent = 'Henüz veri yok';
                p.textContent = this.activeTab === 'students'
                    ? 'Sahadan girilen öğrenci kayıtları burada listelenecek.'
                    : 'Yemek menüsü kayıtları burada listelenecek.';
            } else {
                h3.textContent = 'Kayıt bulunamadı';
                p.textContent = 'Arama veya filtre kriterlerine uyan veri yok.';
            }
        }

        this.rowInfo.textContent = rows.length === total
            ? `${total} kayıt gösteriliyor`
            : `${total} kayıttan ${rows.length} tanesi gösteriliyor`;
    }

    // ---------- Dışa Aktarma ----------
    exportCSV() {
        const rows = this.getVisibleRows();
        if (rows.length === 0) {
            this.toast('Dışa aktarılacak kayıt yok.', 'warning');
            return;
        }
        const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        let headers, lines;
        if (this.activeTab === 'students') {
            const stateText = { active: 'Aktif', expiring: 'Bitişi Yakın', expired: 'Süresi Doldu', passive: 'Pasif' };
            headers = ['Ad Soyad', 'Öğrenci No', 'Telefon', 'Kayıt Tarihi', 'Bitiş Tarihi', 'Kalan Gün', 'Durum'];
            lines = rows.map(r => [r.fullName, r.studentNumber, r.phoneNumber, r.registrationDate, r.subscriptionEndDate, r.remaining ?? '', stateText[r.state]].map(q).join(';'));
        } else {
            headers = ['Tarih', 'Kategori', 'Yemek', 'Not', 'Kaynak'];
            lines = rows.map(r => [r.date, r.category, r.name, r.note, r.source === 'official' ? 'Resmi Takvim' : 'Elle Eklendi'].map(q).join(';'));
        }
        const csv = '\uFEFF' + [headers.join(';'), ...lines].join('\r\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin_${this.activeTab === 'students' ? 'ogrenciler' : 'yemek_menusu'}_${getLocalDateString()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.toast(`${rows.length} kayıt CSV olarak indirildi.`, 'success');
    }
}

// Prototype seviyesinde de init metodunu garantiye al
AdminPanel.prototype.init = function () {
    this.initDOM();
    this.bindEvents();
    if (this.filterSelect) {
        this.populateFilterOptions();
    }
    return this;
};

// ============================================================
// ADMIN PANELİ BAŞLATMA (INIT) VE EVENT DELEGATION
// ============================================================

/**
 * Admin panelini güvenle başlatan yardımcı fonksiyon.
 * window.adminPanel henüz tanımlanmamışsa veya eski/eksik bir nesneyse
 * yeniden oluşturur ve her durumda init() çağrısını güvenle gerçekleştirir.
 */
function initAdminPanel() {
    try {
        if (!window.adminPanel || typeof window.adminPanel.init !== 'function') {
            window.adminPanel = new AdminPanel();
        } else {
            window.adminPanel.init();
        }
    } catch (err) {
        console.error("AdminPanel başlatma hatası:", err);
    }
}

// Global export: İhtiyaç halinde dışarıdan da doğrudan çağrılabilir
window.initAdminPanel = initAdminPanel;

/**
 * Global Event Delegation (Doğrudan Tıklama Garantisi):
 * Admin butonu (#adminFab) DOM'a ne zaman girerse girsin veya
 * modül script gecikse bile tıklandığı anda login penceresini açar.
 */
document.addEventListener('click', function (e) {
    var fab = e.target.closest('#adminFab');
    if (fab) {
        e.preventDefault();
        e.stopPropagation();
        if (!window.adminPanel || typeof window.adminPanel.openLogin !== 'function') {
            initAdminPanel();
        }
        if (window.adminPanel) {
            if (typeof window.adminPanel.isAuthenticated === 'function' && window.adminPanel.isAuthenticated()) {
                window.adminPanel.openPanel();
            } else if (typeof window.adminPanel.openLogin === 'function') {
                window.adminPanel.openLogin();
            }
        }
    }
});

// Global App Initialization
function startApp() {
    try {
        if (!window.app) {
            window.app = new StudentManager();
        }
    } catch (e) {
        console.error("StudentManager başlatma hatası:", e);
    }

    try {
        if (!window.mealManager) {
            window.mealManager = new MealManager();
        }
    } catch (e) {
        console.error("MealManager başlatma hatası:", e);
    }

    initAdminPanel();
}

// 1. DOMContentLoaded veya hazır durum
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}

// 2. window.load (tüm stil ve harici kaynaklar yüklendiğinde yedek tetikleme)
window.addEventListener('load', function () {
    startApp();
    initAdminPanel();
});

// 3. Asenkron microtask güvencesi (script defer/module gecikmelerine karşı)
setTimeout(function () {
    startApp();
    initAdminPanel();
}, 80);
