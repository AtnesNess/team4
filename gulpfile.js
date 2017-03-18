'use strict';

const rename = require('gulp-rename');
const gulp = require('gulp');
const watch = require('gulp-watch');
const prefixer = require('gulp-autoprefixer');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const concat = require('gulp-concat');
const cleanCSS = require('gulp-minify-css');
const less = require('gulp-less');
const imagemin = require('gulp-imagemin');
const promise = require('promise');
const jpegtran = require('imagemin-jpegtran');
const nodemon = require('gulp-nodemon');
const babel = require('gulp-babel');
const Path = require('path');
const tap = require('gulp-tap');
const util = require('util');
const merge = require('merge-stream');
const server = require('gulp-express');

let path = {

    build: { //Тут мы укажем куда складывать готовые после сборки файлы
        html: 'build/html',
        hb: 'build/hbs',
        layouts: 'build/layouts/',
        js: 'build/public/js/',
        css: 'build/public/css/',
        img: 'build/public/img/',
        fonts: 'build/fonts/',
        models: 'build/models/',
        view_models: 'build/view_models/',
        controllers: 'build/controllers/'
    },
    src: { //Пути откуда брать исходники
        html: 'src/blocks/**/*.html', //мы хотим взять все файлы с расширением .html
        hb: 'src/blocks/**/*.hbs', //мы хотим взять все файлы с расширением .html
        layouts: 'src/blocks/layouts/*.hbs', //layouts берем отсюда
        js: 'src/blocks/**/*.js',//В стилях и скриптах нам понадобятся только main файлы
        style: 'src/blocks/**/*.less',
        style_raw: 'src/blocks/**/*.css',
        img: 'src/blocks/**/img/*.*', //Синтаксис /**/*.* означает - взять все файлы всех расширений из папки и из вложенных каталогов
        fonts: 'src/fonts/**/*.*',
        models: 'src/models/**/*.*',
        view_models: 'src/view_models/**/*.*',
        controllers: 'src/controllers/**/*.*'
    },

    clean: './build'
};

path.watch = path.src;

function getUniqueBlockName(directory) {
    /**
     * @param directory: String - директория относительно src/blocks/
     * @returns String - уникальное имя компоненты
     */
    if (directory === '.') {

        return '';
    }

    return directory.split(Path.sep).join('-');
}

gulp.task('html:build', () => {
    gulp.src(path.src.html) //Выберем файлы по нужному пути
        .pipe(gulp.dest(path.build.html)) //Выплюнем их в папку build
        .pipe(server.notify()); //И перезагрузим наш сервер для обновлений
});

function bufferReplace(file, match, str) {
    /**
     * @param file: File - Файл в котором заменяем даные
     * @param match: String/RegEx - шаблон, по которому будем сравнивать строки
     * @param str: String - строка, на которую будет заменена строка, подходящая под шаблон
     * @returns None
     */
    file.contents = new Buffer(file.contents.toString().replace(match, str));
}

gulp.task('hb:build', () => {
    gulp.src([path.src.hb, '!' + path.src.layouts]) //Выберем файлы по нужному пути
        .pipe(tap((file, t) => {
            let dir = Path.dirname(file.relative);
            let className = getUniqueBlockName(dir);
            file.contents = Buffer.concat([
                new Buffer(util.format('<div class="%s">\n', className)),
                file.contents,
                new Buffer('<\div>')
            ]);
            //меняем адреса с картинками на /static/img...
            bufferReplace(file, /img\/([A-Za-z0-9\.]+)/, '/static/img/'+dir+'/img/$1');
        }))
        .pipe(rename((path) => {
            //для того чтобы не было колизий в partials имена в build
            //будут выглядеть так: путь-до-файла-из-blocks-файл.hbs
            //в шаблонах partials нужно будет указывать именно так
            let dir = path.dirname;
            path.dirname = '';
            path.basename = getUniqueBlockName(dir);
        }))
        .pipe(gulp.dest(path.build.hb)) //Выплюнем их в папку build
        .pipe(server.notify()); //И перезагрузим наш сервер для обновлений

    gulp.src(path.src.layouts) //Выберем файлы по нужному пути
        .pipe(gulp.dest(path.build.layouts)) //Выплюнем их в папку build
        .pipe(server.notify()); //И перезагрузим наш сервер для обновлений

});

gulp.task('js:build', () => {
    gulp.src(path.src.js) //Найдем наш main файл
        .pipe(sourcemaps.init()) //Инициализируем sourcemap
        .pipe(babel()) //переводим ES6 => ES5
        .pipe(uglify()) //Сожмем наш js
        .pipe(concat('all.js')) //Конкатинируем js
        .pipe(sourcemaps.write()) //Пропишем карты
        .pipe(gulp.dest(path.build.js)) //Выплюнем готовый файл в build
        .pipe(server.notify()); //И перезагрузим сервер
});

gulp.task('style:build', () => {
    let lessStream = gulp.src(path.src.style)
        .pipe(tap((file, t) => {
            let className = getUniqueBlockName(Path.dirname(file.relative));
            if (!className) {

                return;
            }
            file.contents = Buffer.concat([
                new Buffer('.' + className + "{\n"),
                file.contents,
                new Buffer("}"),
            ]);
            //меняем адреса с картинками на /static/img...
            bufferReplace(file, /img\/([A-Za-z0-9\.]+)/, '/static/img/'+file.relative+'/img/$1');
        }))
        .pipe(less())
        .pipe(concat('less-files.css'));

    let cssStream = gulp.src(path.src.style_raw)
        .pipe(concat('css-files.css'));

    let mergedStream = merge(lessStream, cssStream)
        .pipe(sourcemaps.init()) //Инициализируем sourcemap
        .pipe(concat('all.css')) //Конкатинируем css
        .pipe(prefixer()) //Добавим вендорные префиксы
        .pipe(cleanCSS()) //Сожмем
        .pipe(sourcemaps.write())
        .pipe(gulp.dest(path.build.css)) //И в build
        .pipe(server.notify());

    return mergedStream;

});

gulp.task('image:build', () => {
    gulp.src(path.src.img) //Выберем наши картинки
        .pipe(imagemin({ //Сожмем их
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [jpegtran()],
            interlaced: true
        }))
        .pipe(gulp.dest(path.build.img)) //И бросим в build
        .pipe(server.notify());
});

gulp.task('fonts:build', () => {
    gulp.src(path.src.fonts)
        .pipe(gulp.dest(path.build.fonts))
        .pipe(server.notify());
});

gulp.task('sjs:build', () => {

    return Promise.all([
        server.stop(),
        gulp.src(path.src.view_models)
            .pipe(gulp.dest(path.build.view_models)),
        gulp.src(path.src.models)
            .pipe(gulp.dest(path.build.models)),
        gulp.src(path.src.controllers)
            .pipe(gulp.dest(path.build.controllers)),
    ])
        .then(() => {
            server.run(['app.js']);
        })
});

gulp.task('build', [
    'html:build',
    'hb:build',
    'js:build',
    'style:build',
    'fonts:build',
    'image:build',
    'sjs:build',
]);

gulp.task('watch', () => {
    watch([path.watch.html], (event, cb) => {
        gulp.start('html:build');
    });
    watch([path.watch.style], (event, cb) => {
        gulp.start('style:build');
    });
    watch([path.watch.style_raw], (event, cb) => {
        gulp.start('style:build');
    });
    watch([path.watch.layouts], (event, cb) => {
        gulp.start('hb:build');
    });
    watch([path.watch.js], (event, cb) => {
        gulp.start('js:build');
    });
    watch([path.watch.hb], (event, cb) => {
        gulp.start('hb:build');
    });
    watch([path.watch.controllers], (event, cb) => {
        gulp.start('sjs:build');

    });

    watch([path.watch.models], (event, cb) => {
        gulp.start('sjs:build');
    });
    watch([path.watch.view_models], (event, cb) => {
        gulp.start('sjs:build');
    });
    watch([path.watch.img], (event, cb) => {
        gulp.start('image:build');
    });
    watch([path.watch.fonts], (event, cb) => {
        gulp.start('fonts:build');
    });
});

gulp.task('clean', (cb) => {
    rimraf(path.clean, cb);
});

gulp.task('webserver', () => {
    server.run(['app.js']);
});

gulp.task('default', ['build', 'webserver', 'watch']);
