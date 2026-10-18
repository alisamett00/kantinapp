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

try {
    const fbApp = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js");
    const fbFirestore = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
    app = fbApp.initializeApp(firebaseConfig);
    db = fbFirestore.getFirestore(app);
    collection = fbFirestore.collection;
    addDoc = fbFirestore.addDoc;
    updateDoc = fbFirestore.updateDoc;
    deleteDoc = fbFirestore.deleteDoc;
    doc = fbFirestore.doc;
    onSnapshot = fbFirestore.onSnapshot;
    query = fbFirestore.query;
} catch (e) {
    console.warn("Firebase bulut bağlantısı yüklenemedi. Telefon hafızası (localStorage) aktif:", e);
}

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
    }

    initDOM() {
        // Elements
        this.studentsList = document.getElementById('studentsList');
        this.addStudentBtn = document.getElementById('addStudentBtn');
        this.exportCsvBtn = document.getElementById('exportCsvBtn');
        this.installAppBtn = document.getElementById('installAppBtn');

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

        const studentData = {
            fullName: this.inputs.fullName.value.trim(),
            studentNumber: this.inputs.studentNumber.value.trim(),
            phoneNumber: this.inputs.phoneNumber.value.trim(),
            registrationDate: this.inputs.registrationDate.value,
            subscriptionEndDate: this.inputs.subscriptionEndDate.value,
            status: this.inputs.status.value
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

    editStudent(id) {
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
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
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
                </div>
            `;
        }).join('');
    }
}

// ============================================================
// YEMEK LİSTESİ SİSTEMİ (MEAL MENU MODULE)
// ============================================================
const MEAL_STORAGE_KEY = 'kantin_yemek_listesi_v1';
const MEAL_LEGACY_KEY = 'yemekListesi';
const MEAL_SCHEDULE_VERSION_KEY = 'kantin_yemek_takvim_surum';
const MEAL_SCHEDULE_VERSION = 'ekim-2026-v1';

// EKİM 2026 ÖĞLE MENÜSÜ (1. Yemek | 2. Yemek | 3. Yemek)
const OFFICIAL_MEAL_SCHEDULE = {
    '2026-10-01': ['Patates Sulusu', 'Pirinç Pilavı', 'Yoğurt'],
    '2026-10-02': ['Rosto Köfte', 'Pirinç Pilavı', 'Cacık'],
    '2026-10-05': ['Etli Nohut Sulusu', 'Bulgur Pilavı', 'Yoğurt'],
    '2026-10-06': ['Biber Dolması', 'Yoğurtlu Mantı', 'Ezogelin Çorba'],
    '2026-10-07': ['Patlıcan Parmak Kebabı', 'Bulgur Pilavı', 'Yayla Çorbası'],
    '2026-10-08': ['Fırın Tavuk Sarma', 'Pirinç Pilavı', 'Cacık'],
    '2026-10-09': ['İzmir Köfte', 'Mısırlı Pirinç Pilavı', 'Tarhana Çorbası'],
    '2026-10-12': ['Etli Kuru Fasulye', 'Bulgur Pilavı', 'Yoğurt'],
    '2026-10-13': ['Karnıyarık', 'Pirinç Pilavı', 'Cacık'],
    '2026-10-14': ['Bezdirme Köfte', 'Bulgur Pilavı', 'Yayla Çorbası'],
    '2026-10-15': ['Ekşili Eya Sulusu', 'Pirinç Pilavı', 'Yoğurt'],
    '2026-10-16': ['Pilav Üstü Tavuk Döner', 'Ezogelin Çorba', 'Ezogelin Çorba'],
    '2026-10-19': ['Etli Nohut Sulusu', 'Bulgur Pilavı', 'Yoğurt'],
    '2026-10-20': ['Tavuk Şinitzel', 'Sebzeli Makarna', 'Toyga Çorba'],
    '2026-10-21': ['Maraş Tava', 'Bulgur Pilavı', 'Cacık'],
    '2026-10-22': ['Biber Dolması', 'Yoğurtlu Mantı', 'Ezogelin Çorba'],
    '2026-10-23': ['Fırın Köfte', 'Pirinç Pilavı', 'Cacık'],
    '2026-10-26': ['Etli Kuru Fasulye', 'Bulgur Pilavı', 'Yoğurt'],
    '2026-10-27': ['Arap Tava', 'Pirinç Pilavı', 'Cacık'],
    '2026-10-28': ['Peynirli Kayık Börek', 'Döğmeli Mercimek Çorbası', 'Yoğurt'],
    '2026-10-29': ['Kasap Köfte+Cips', 'Sebzeli Makarna', 'Yayla Çorbası'],
    '2026-10-30': ['Tavuk Haşlama', 'Pirinç Pilavı', 'Yoğurt']
};

// Yerel (cihaz saati) bugünün tarihi: YYYY-MM-DD (UTC kayması olmadan)
function getLocalDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function guessMealCategory(name, position) {
    const n = name.toLocaleLowerCase('tr-TR');
    if (n.includes('çorba')) return 'Çorba';
    if (n.includes('yoğurt') && !n.includes('yoğurtlu')) return 'Salata / Meze';
    if (n.includes('cacık')) return 'Salata / Meze';
    if (position === 0) return 'Ana Yemek';
    return 'Pilav / Makarna';
}

function buildOfficialMeals() {
    const list = [];
    Object.keys(OFFICIAL_MEAL_SCHEDULE).forEach(date => {
        const seen = new Set();
        OFFICIAL_MEAL_SCHEDULE[date].forEach((name, idx) => {
            if (seen.has(name)) return; // aynı yemek iki kez yazılmışsa tek göster
            seen.add(name);
            list.push({
                id: `off_${date}_${idx + 1}`,
                date,
                category: guessMealCategory(name, idx),
                name,
                note: '',
                official: true
            });
        });
    });
    return list;
}

class MealManager {
    constructor() {
        this.meals = this.loadMeals();
        this.selectedDate = getLocalDateString();
        this.currentDay = this.selectedDate;

        this.initDOM();
        this.bindEvents();
        this.render();
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

    loadMeals() {
        let stored = [];
        try {
            // Check primary and fallback legacy key
            const raw = localStorage.getItem(MEAL_STORAGE_KEY) || localStorage.getItem(MEAL_LEGACY_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) stored = parsed;
            }
        } catch (e) {
            console.error("Yemek listesi okuma hatası:", e);
        }

        const needsSync = localStorage.getItem(MEAL_SCHEDULE_VERSION_KEY) !== MEAL_SCHEDULE_VERSION;
        if (!needsSync) return stored;

        // Takvim güncellendi: eski örnek/resmi kayıtları temizle, kullanıcının kendi eklediklerini koru
        const legacySampleIds = ['ymk_1', 'ymk_2', 'ymk_3', 'ymk_4'];
        const userMeals = stored.filter(m => !m.official && !legacySampleIds.includes(m.id));
        const merged = [...buildOfficialMeals(), ...userMeals];

        try {
            const dataStr = JSON.stringify(merged);
            localStorage.setItem(MEAL_STORAGE_KEY, dataStr);
            localStorage.setItem(MEAL_LEGACY_KEY, dataStr);
            localStorage.setItem(MEAL_SCHEDULE_VERSION_KEY, MEAL_SCHEDULE_VERSION);
        } catch (e) {
            console.error("Yemek takvimi senkronizasyon hatası:", e);
        }
        return merged;
    }

    saveMeals() {
        try {
            const dataStr = JSON.stringify(this.meals);
            localStorage.setItem(MEAL_STORAGE_KEY, dataStr);
            localStorage.setItem(MEAL_LEGACY_KEY, dataStr); // Dual persistence
            return true;
        } catch (e) {
            console.error("Yemek listesi kaydetme hatası:", e);
            return false;
        }
    }

    handleAddMeal() {
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
        this.saveMeals();

        if (this.mealName) this.mealName.value = '';
        if (this.mealNote) this.mealNote.value = '';
        if (this.mealName) this.mealName.focus();

        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast(`"${name}" menüye eklendi.`, 'success');
        }

        this.render();
    }

    deleteMeal(id) {
        this.meals = this.meals.filter(m => m.id !== id);
        this.saveMeals();

        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast('Yemek menüden silindi.', 'info');
        }

        this.render();
    }

    addSampleMenu() {
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

        this.saveMeals();
        if (window.app) {
            window.app.triggerHaptic();
            window.app.showToast('Örnek 4 kap menü eklendi.', 'success');
        }
        this.render();
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

    shareOnWhatsApp() {
        const targetDate = this.mealSelectedDate ? this.mealSelectedDate.value : this.selectedDate;
        const dayMeals = this.meals.filter(m => m.date === targetDate);

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
        const dayMeals = this.meals.filter(m => m.date === targetDate);

        if (this.mealListDateTitle) {
            this.mealListDateTitle.textContent = `${this.formatDisplayDate(targetDate)} Menüsü`;
        }
        if (this.mealCountBadge) {
            this.mealCountBadge.textContent = `${dayMeals.length} Yemek`;
        }

        if (dayMeals.length === 0) {
            this.mealItemsList.innerHTML = `
                <div class="meal-empty-box">
                    <i class="ph-bold ph-cooking-pot"></i>
                    <p>Bu tarihe henüz yemek eklenmemiş.</p>
                    <span style="font-size: 11px; color: #94a3b8;">Yukarıdaki formdan yemek ekleyebilir veya örnek menü butonunu kullanabilirsiniz.</span>
                </div>
            `;
            return;
        }

        this.mealItemsList.innerHTML = dayMeals.map(meal => `
            <div class="meal-item-card">
                <div class="meal-item-info">
                    <span class="meal-cat-badge">${this.getCategoryIcon(meal.category)} ${meal.category}</span>
                    <span class="meal-item-name">${meal.name}</span>
                    ${meal.note ? `<span class="meal-item-note">${meal.note}</span>` : ''}
                </div>
                <button type="button" class="meal-del-btn" onclick="mealManager.deleteMeal('${meal.id}')" title="Yemeği Sil">
                    <i class="ph-bold ph-trash"></i>
                </button>
            </div>
        `).join('');
    }

    renderPreview() {
        const today = getLocalDateString();
        const todayMeals = this.meals.filter(m => m.date === today);

        if (this.menuTodayDateText) {
            this.menuTodayDateText.textContent = this.formatDisplayDate(today);
        }

        if (!this.menuPreviewList) return;

        if (todayMeals.length === 0) {
            this.menuPreviewList.innerHTML = `
                <span class="menu-empty-hint">Bugün için yemek menüsü bulunmuyor (hafta sonu / tatil). Menüyü yönetmek için butona dokunun.</span>
            `;
            return;
        }

        this.menuPreviewList.innerHTML = todayMeals.map(m => `
            <div class="menu-preview-pill">
                <span>${this.getCategoryIcon(m.category)}</span>
                <span>${m.name}</span>
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
                this.render();
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
const ADMIN_PASSWORD = 'admin123';
const ADMIN_SESSION_KEY = 'kantin_admin_oturum_v1';

/**
 * Admin veri kaynağı katmanı.
 * Şimdilik cihazdaki (StudentManager / MealManager) verileri okur.
 * Bulut veritabanına geçildiğinde yalnızca bu nesnedeki fonksiyonların içeriği
 * (ör. Firestore getDocs / REST fetch) değiştirilir; panel arayüzü aynen çalışmaya devam eder.
 */
const AdminDataSource = {
    getLabel() {
        return db ? 'Bulut (Firebase) + Cihaz hafızası' : 'Cihaz hafızası';
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
        if (hasSession) this.openPanel({ silent: true });
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
    }

    bindEvents() {
        if (this.fab && !this.fab._adminBound) {
            this.fab._adminBound = true;
            this.fab.addEventListener('click', (e) => {
                e.preventDefault();
                this.haptic();
                this.openLogin();
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
        if (this.appContainer) this.appContainer.style.display = 'none';
        this.fab.style.display = 'none';
        this.panel.style.display = 'block';
        this.isOpen = true;
        window.scrollTo(0, 0);

        this.refresh();
        if (!silent) {
            this.haptic();
            this.toast('Yönetim paneline giriş yapıldı.', 'success');
        }
    }

    logout() {
        this.haptic();
        try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) { /* yok say */ }

        this.isOpen = false;
        this.panel.style.display = 'none';
        document.body.classList.remove('admin-mode');
        if (this.appContainer) this.appContainer.style.display = '';
        this.fab.style.display = '';
        window.scrollTo(0, 0);

        this.toast('Yönetim panelinden çıkış yapıldı.', 'info');
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
            ? '<span class="admin-source-tag"><i class="ph-bold ph-seal-check"></i> Resmi Takvim</span>'
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
        if (window.adminPanel && typeof window.adminPanel.openLogin === 'function') {
            window.adminPanel.openLogin();
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
