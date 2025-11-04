--
-- PostgreSQL database dump
--

\restrict RrkednhqEiRsHAUetmr5twbzqW4mwHODLCWvd4kns1zYUDW64pl7KHiYsA3hbX5

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

-- Started on 2025-11-04 12:27:45

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 225 (class 1255 OID 41909)
-- Name: generate_menu_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_menu_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id INTEGER;
    new_id TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(id_menu FROM 4) AS INTEGER)), 0) + 1 
    INTO next_id FROM menu;
    
    NEW.id_menu := 'MNU' || LPAD(next_id::TEXT, 3, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_menu_id() OWNER TO postgres;

--
-- TOC entry 224 (class 1255 OID 41908)
-- Name: generate_user_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_user_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_id INTEGER;
    new_id TEXT;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(id_pengguna FROM 4) AS INTEGER)), 0) + 1 
    INTO next_id FROM pengguna;
    
    NEW.id_pengguna := 'USR' || LPAD(next_id::TEXT, 3, '0');
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_user_id() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 215 (class 1259 OID 41805)
-- Name: cabang; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cabang (
    id_cabang character(12) NOT NULL,
    nama_cabang character varying(50) NOT NULL,
    alamat character varying(100) NOT NULL,
    no_telp character varying(20) NOT NULL
);


ALTER TABLE public.cabang OWNER TO postgres;

--
-- TOC entry 216 (class 1259 OID 41808)
-- Name: detail_pesanan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.detail_pesanan (
    id_detail character(12) NOT NULL,
    id_pesanan character(12),
    id_menu character(12),
    jumlah integer NOT NULL,
    subtotal numeric(10,2)
);


ALTER TABLE public.detail_pesanan OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 41811)
-- Name: laporan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.laporan (
    id_laporan character(12) NOT NULL,
    id_cabang character(12),
    periode date,
    total_transaksi integer,
    pendapatan numeric(10,2),
    dibuat_pada timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.laporan OWNER TO postgres;

--
-- TOC entry 218 (class 1259 OID 41815)
-- Name: menu; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.menu (
    id_menu character(12) NOT NULL,
    nama_menu character varying(50) NOT NULL,
    harga numeric(10,2) NOT NULL,
    stok integer DEFAULT 0,
    kategori character varying(50)
);


ALTER TABLE public.menu OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 41819)
-- Name: pembayaran; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pembayaran (
    id_pembayaran character(12) NOT NULL,
    id_pesanan character(12),
    metode character varying(20),
    total_bayar numeric(10,2),
    tanggal_bayar timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pembayaran_metode_check CHECK (((metode)::text = ANY (ARRAY[('Chash'::character varying)::text, ('QRIS'::character varying)::text, ('Debit'::character varying)::text, ('Transfer'::character varying)::text])))
);


ALTER TABLE public.pembayaran OWNER TO postgres;

--
-- TOC entry 220 (class 1259 OID 41824)
-- Name: pengguna; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pengguna (
    id_pengguna character(12) NOT NULL,
    nama_pengguna character varying(50) NOT NULL,
    username character varying(30) NOT NULL,
    kata_sandi character varying(10) NOT NULL,
    peran character varying(20) NOT NULL,
    CONSTRAINT pengguna_peran_check CHECK (((peran)::text = ANY ((ARRAY['admin'::character varying, 'kasir'::character varying, 'manager'::character varying, 'owner'::character varying])::text[])))
);


ALTER TABLE public.pengguna OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 41828)
-- Name: pesanan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pesanan (
    id_pesanan character(12) NOT NULL,
    id_pengguna character(12),
    tanggal_pesanan timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    total numeric(10,2),
    status character varying(20) DEFAULT 'Pending'::character varying,
    CONSTRAINT pesanan_status_check CHECK (((status)::text = ANY ((ARRAY['selesai'::character varying, 'completed'::character varying, 'pending'::character varying, 'dibatalkan'::character varying])::text[])))
);


ALTER TABLE public.pesanan OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 41834)
-- Name: stok; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stok (
    id_stok character(12) NOT NULL,
    id_menu character(12),
    id_pengguna character(12),
    tanggal timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    perubahan integer,
    keterangan character varying(255)
);


ALTER TABLE public.stok OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 41838)
-- Name: struk; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.struk (
    id_struk character(12) NOT NULL,
    id_pembayaran character(12),
    nomor_struk character varying(50),
    tanggal_cetak timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.struk OWNER TO postgres;

--
-- TOC entry 4957 (class 0 OID 41805)
-- Dependencies: 215
-- Data for Name: cabang; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cabang (id_cabang, nama_cabang, alamat, no_telp) FROM stdin;
\.


--
-- TOC entry 4958 (class 0 OID 41808)
-- Dependencies: 216
-- Data for Name: detail_pesanan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.detail_pesanan (id_detail, id_pesanan, id_menu, jumlah, subtotal) FROM stdin;
DET001      	PSN001      	MNU005      	1	5000.00
DET002      	PSN002      	MNU005      	1	5000.00
DET003      	PSN003      	MNU001      	1	15000.00
DET004      	PSN004      	MNU002      	1	10.00
DET005      	PSN005      	MNU001      	1	15000.00
DET006      	PSN006      	MNU001      	1	15000.00
\.


--
-- TOC entry 4959 (class 0 OID 41811)
-- Dependencies: 217
-- Data for Name: laporan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.laporan (id_laporan, id_cabang, periode, total_transaksi, pendapatan, dibuat_pada) FROM stdin;
\.


--
-- TOC entry 4960 (class 0 OID 41815)
-- Dependencies: 218
-- Data for Name: menu; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.menu (id_menu, nama_menu, harga, stok, kategori) FROM stdin;
MNU005      	Es Teh	5000.00	3	Minuman
MNU004      	Mie Goreng	12000.00	20	Makanan
MNU002      	Teh Manis	5000.00	9	Minuman
MNU006      	Cheese Cake	20000.00	20	Dessert
MNU001      	Kopi Hitam	15000.00	8	Minuman
\.


--
-- TOC entry 4961 (class 0 OID 41819)
-- Dependencies: 219
-- Data for Name: pembayaran; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pembayaran (id_pembayaran, id_pesanan, metode, total_bayar, tanggal_bayar) FROM stdin;
\.


--
-- TOC entry 4962 (class 0 OID 41824)
-- Dependencies: 220
-- Data for Name: pengguna; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pengguna (id_pengguna, nama_pengguna, username, kata_sandi, peran) FROM stdin;
USR001      	Admin Utama	admin	admin123	admin
USR002      	dap	daps	135	kasir
USR003      	Saman	kasir	123	kasir
USR004      	hai	admin2	123	admin
USR005      	clar	manager1	123	manager
USR006      	dapp	owner1	123	owner
\.


--
-- TOC entry 4963 (class 0 OID 41828)
-- Dependencies: 221
-- Data for Name: pesanan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.pesanan (id_pesanan, id_pengguna, tanggal_pesanan, total, status) FROM stdin;
PSN001      	USR001      	2025-11-02 11:07:02.049031	5000.00	completed
PSN002      	USR001      	2025-11-03 09:19:11.037743	5000.00	completed
PSN003      	USR001      	2025-11-03 20:07:23.012633	15000.00	completed
PSN004      	USR001      	2025-11-03 20:43:41.44119	10.00	completed
PSN005      	USR001      	2025-11-03 22:37:38.013903	15000.00	completed
PSN006      	USR003      	2025-11-03 22:38:04.975261	15000.00	completed
\.


--
-- TOC entry 4964 (class 0 OID 41834)
-- Dependencies: 222
-- Data for Name: stok; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.stok (id_stok, id_menu, id_pengguna, tanggal, perubahan, keterangan) FROM stdin;
\.


--
-- TOC entry 4965 (class 0 OID 41838)
-- Dependencies: 223
-- Data for Name: struk; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.struk (id_struk, id_pembayaran, nomor_struk, tanggal_cetak) FROM stdin;
\.


--
-- TOC entry 4779 (class 2606 OID 41843)
-- Name: cabang cabang_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cabang
    ADD CONSTRAINT cabang_pkey PRIMARY KEY (id_cabang);


--
-- TOC entry 4781 (class 2606 OID 41845)
-- Name: detail_pesanan detail_pesanan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detail_pesanan
    ADD CONSTRAINT detail_pesanan_pkey PRIMARY KEY (id_detail);


--
-- TOC entry 4783 (class 2606 OID 41847)
-- Name: laporan laporan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.laporan
    ADD CONSTRAINT laporan_pkey PRIMARY KEY (id_laporan);


--
-- TOC entry 4785 (class 2606 OID 41849)
-- Name: menu menu_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.menu
    ADD CONSTRAINT menu_pkey PRIMARY KEY (id_menu);


--
-- TOC entry 4787 (class 2606 OID 41851)
-- Name: pembayaran pembayaran_id_pesanan_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pembayaran
    ADD CONSTRAINT pembayaran_id_pesanan_key UNIQUE (id_pesanan);


--
-- TOC entry 4789 (class 2606 OID 41853)
-- Name: pembayaran pembayaran_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pembayaran
    ADD CONSTRAINT pembayaran_pkey PRIMARY KEY (id_pembayaran);


--
-- TOC entry 4791 (class 2606 OID 41855)
-- Name: pengguna pengguna_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengguna
    ADD CONSTRAINT pengguna_pkey PRIMARY KEY (id_pengguna);


--
-- TOC entry 4793 (class 2606 OID 41857)
-- Name: pengguna pengguna_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pengguna
    ADD CONSTRAINT pengguna_username_key UNIQUE (username);


--
-- TOC entry 4795 (class 2606 OID 41859)
-- Name: pesanan pesanan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pesanan
    ADD CONSTRAINT pesanan_pkey PRIMARY KEY (id_pesanan);


--
-- TOC entry 4797 (class 2606 OID 41861)
-- Name: stok stok_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stok
    ADD CONSTRAINT stok_pkey PRIMARY KEY (id_stok);


--
-- TOC entry 4799 (class 2606 OID 41863)
-- Name: struk struk_id_pembayaran_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.struk
    ADD CONSTRAINT struk_id_pembayaran_key UNIQUE (id_pembayaran);


--
-- TOC entry 4801 (class 2606 OID 41865)
-- Name: struk struk_nomor_struk_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.struk
    ADD CONSTRAINT struk_nomor_struk_key UNIQUE (nomor_struk);


--
-- TOC entry 4803 (class 2606 OID 41867)
-- Name: struk struk_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.struk
    ADD CONSTRAINT struk_pkey PRIMARY KEY (id_struk);


--
-- TOC entry 4812 (class 2620 OID 41911)
-- Name: menu tr_generate_menu_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_generate_menu_id BEFORE INSERT ON public.menu FOR EACH ROW EXECUTE FUNCTION public.generate_menu_id();


--
-- TOC entry 4813 (class 2620 OID 41910)
-- Name: pengguna tr_generate_user_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_generate_user_id BEFORE INSERT ON public.pengguna FOR EACH ROW EXECUTE FUNCTION public.generate_user_id();


--
-- TOC entry 4804 (class 2606 OID 41868)
-- Name: detail_pesanan detail_pesanan_id_menu_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detail_pesanan
    ADD CONSTRAINT detail_pesanan_id_menu_fkey FOREIGN KEY (id_menu) REFERENCES public.menu(id_menu) ON DELETE CASCADE;


--
-- TOC entry 4805 (class 2606 OID 41873)
-- Name: detail_pesanan detail_pesanan_id_pesanan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.detail_pesanan
    ADD CONSTRAINT detail_pesanan_id_pesanan_fkey FOREIGN KEY (id_pesanan) REFERENCES public.pesanan(id_pesanan) ON DELETE CASCADE;


--
-- TOC entry 4806 (class 2606 OID 41878)
-- Name: laporan laporan_id_cabang_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.laporan
    ADD CONSTRAINT laporan_id_cabang_fkey FOREIGN KEY (id_cabang) REFERENCES public.cabang(id_cabang) ON DELETE CASCADE;


--
-- TOC entry 4807 (class 2606 OID 41883)
-- Name: pembayaran pembayaran_id_pesanan_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pembayaran
    ADD CONSTRAINT pembayaran_id_pesanan_fkey FOREIGN KEY (id_pesanan) REFERENCES public.pesanan(id_pesanan) ON DELETE CASCADE;


--
-- TOC entry 4808 (class 2606 OID 41888)
-- Name: pesanan pesanan_id_pengguna_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pesanan
    ADD CONSTRAINT pesanan_id_pengguna_fkey FOREIGN KEY (id_pengguna) REFERENCES public.pengguna(id_pengguna) ON DELETE SET NULL;


--
-- TOC entry 4809 (class 2606 OID 41893)
-- Name: stok stok_id_menu_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stok
    ADD CONSTRAINT stok_id_menu_fkey FOREIGN KEY (id_menu) REFERENCES public.menu(id_menu) ON DELETE CASCADE;


--
-- TOC entry 4810 (class 2606 OID 41898)
-- Name: stok stok_id_pengguna_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stok
    ADD CONSTRAINT stok_id_pengguna_fkey FOREIGN KEY (id_pengguna) REFERENCES public.pengguna(id_pengguna) ON DELETE SET NULL;


--
-- TOC entry 4811 (class 2606 OID 41903)
-- Name: struk struk_id_pembayaran_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.struk
    ADD CONSTRAINT struk_id_pembayaran_fkey FOREIGN KEY (id_pembayaran) REFERENCES public.pembayaran(id_pembayaran) ON DELETE CASCADE;


-- Completed on 2025-11-04 12:27:45

--
-- PostgreSQL database dump complete
--

\unrestrict RrkednhqEiRsHAUetmr5twbzqW4mwHODLCWvd4kns1zYUDW64pl7KHiYsA3hbX5

